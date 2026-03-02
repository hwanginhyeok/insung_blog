"""
AI 콘텐츠 생성 모듈 — Claude Vision으로 사진 분석 후 블로그 초안 생성

사용 흐름:
  1. generate_post(image_paths, memo) 호출
  2. _analyze_images() — Vision으로 사진 내용 파악
  3. _generate_draft() — writing_style.md 참조하여 제목+본문 생성
  4. _generate_hashtags() — Haiku로 3계층 해시태그 생성
  5. 반환: {"title": str, "body": str, "hashtags": list[str]}
"""
import base64
import json
import mimetypes
import os
from pathlib import Path

from anthropic import Anthropic

from config.settings import (
    CONTENT_AI_MODEL,
    HASHTAG_AI_MODEL,
    HASHTAG_MAX_COUNT,
    HASHTAG_MIN_COUNT,
    MAX_IMAGE_SIZE_MB,
    MAX_IMAGES,
    POST_BODY_MAX_CHARS,
    POST_BODY_MIN_CHARS,
    POST_TITLE_MAX_CHARS,
    SUPPORTED_IMAGE_TYPES,
    WRITING_STYLE_PATH,
)
from src.utils.logger import logger

_client: Anthropic | None = None


def _get_client() -> Anthropic | None:
    """Anthropic 클라이언트 싱글톤. API 키 없으면 None 반환."""
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY 미설정 — AI 콘텐츠 생성 불가")
        return None

    _client = Anthropic(api_key=api_key)
    return _client


def _load_writing_style() -> str:
    """skills/writing_style.md 파일 내용을 로드"""
    if not WRITING_STYLE_PATH.exists():
        logger.warning(f"글쓰기 스타일 가이드 없음: {WRITING_STYLE_PATH}")
        return ""
    return WRITING_STYLE_PATH.read_text(encoding="utf-8")


def _validate_images(image_paths: list[str]) -> list[Path]:
    """이미지 경로 검증 및 Path 객체 반환"""
    validated: list[Path] = []

    if len(image_paths) > MAX_IMAGES:
        logger.warning(f"이미지 {len(image_paths)}장 → 최대 {MAX_IMAGES}장만 사용")
        image_paths = image_paths[:MAX_IMAGES]

    for p in image_paths:
        path = Path(p)
        if not path.exists():
            logger.warning(f"이미지 파일 없음, 건너뜀: {p}")
            continue
        if path.suffix.lower() not in SUPPORTED_IMAGE_TYPES:
            logger.warning(f"지원하지 않는 형식, 건너뜀: {path.suffix} ({p})")
            continue
        size_mb = path.stat().st_size / (1024 * 1024)
        if size_mb > MAX_IMAGE_SIZE_MB:
            logger.warning(f"파일 크기 초과 ({size_mb:.1f}MB), 건너뜀: {p}")
            continue
        validated.append(path)

    return validated


def _encode_image(path: Path) -> tuple[str, str]:
    """이미지를 base64로 인코딩. (media_type, base64_data) 반환"""
    mime_type = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    data = path.read_bytes()
    return mime_type, base64.standard_b64encode(data).decode("utf-8")


def _analyze_images(client: Anthropic, image_paths: list[Path], memo: str) -> str:
    """Claude Vision으로 사진 분석 — 장소, 음식, 분위기 등 파악"""
    content: list[dict] = []

    for path in image_paths:
        media_type, b64_data = _encode_image(path)
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": b64_data,
            },
        })

    prompt = "이 사진들을 분석해줘. 다음 항목을 정리해:\n"
    prompt += "1. 장소 종류 (카페, 식당, 관광지 등)\n"
    prompt += "2. 음식이 있다면 메뉴명과 외관 묘사\n"
    prompt += "3. 전반적인 분위기/인테리어\n"
    prompt += "4. 눈에 띄는 디테일\n"

    if memo:
        prompt += f"\n사용자 메모: {memo}"

    content.append({"type": "text", "text": prompt})

    response = client.messages.create(
        model=CONTENT_AI_MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": content}],
    )
    analysis = response.content[0].text.strip()
    logger.info(f"사진 분석 완료 ({len(analysis)}자)")
    return analysis


def _generate_draft(client: Anthropic, analysis: str, memo: str) -> dict[str, str]:
    """사진 분석 결과 + 스타일 가이드 기반으로 제목과 본문 생성"""
    style_guide = _load_writing_style()

    system_prompt = f"""\
너는 네이버 블로그 게시물을 작성하는 한국인 블로거야.
아래 글쓰기 스타일 가이드를 반드시 따라.

{style_guide}

추가 규칙:
- 제목은 {POST_TITLE_MAX_CHARS}자 이내
- 본문은 {POST_BODY_MIN_CHARS}~{POST_BODY_MAX_CHARS}자
- 사진 순서에 맞춰 자연스럽게 언급
- JSON 형식으로만 출력: {{"title": "...", "body": "..."}}
- body에 줄바꿈은 \\n으로 표현"""

    user_message = f"[사진 분석 결과]\n{analysis}"
    if memo:
        user_message += f"\n\n[메모]\n{memo}"

    response = client.messages.create(
        model=CONTENT_AI_MODEL,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = response.content[0].text.strip()

    # JSON 파싱 (코드블록 래핑 제거)
    cleaned = raw
    if cleaned.startswith("```"):
        # ```json ... ``` 래핑 제거
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error(f"AI 초안 JSON 파싱 실패 — 원본:\n{raw}")
        raise ValueError("AI 초안 생성 실패: JSON 형식 오류")

    title = result.get("title", "").strip()
    body = result.get("body", "").strip()

    if not title or not body:
        raise ValueError("AI 초안 생성 실패: 제목 또는 본문이 비어 있음")

    logger.info(f"초안 생성 완료 — 제목: {title[:30]}... ({len(body)}자)")
    return {"title": title, "body": body}


def _generate_hashtags(client: Anthropic, title: str, body: str) -> list[str]:
    """Haiku로 3계층 해시태그 생성 (위치/카테고리/감성)"""
    system_prompt = f"""\
네이버 블로그 해시태그를 생성해.
규칙:
- 총 {HASHTAG_MIN_COUNT}~{HASHTAG_MAX_COUNT}개
- 3계층: 위치 태그 5개, 카테고리 태그 10개, 감성 태그 10개
- # 없이 태그 텍스트만 (예: 강남맛집)
- 줄바꿈으로 구분, 태그 텍스트만 출력
- 검색 유입에 효과적인 태그 선정"""

    user_message = f"[제목] {title}\n\n[본문]\n{body[:800]}"

    response = client.messages.create(
        model=HASHTAG_AI_MODEL,
        max_tokens=500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = response.content[0].text.strip()

    # 줄바꿈으로 분리, # 제거, 빈 줄 제외
    tags = []
    for line in raw.split("\n"):
        tag = line.strip().lstrip("#").strip()
        if tag and not tag.startswith("-"):
            # "1. 태그" 같은 번호 제거
            parts = tag.split(".", 1)
            if len(parts) == 2 and parts[0].strip().isdigit():
                tag = parts[1].strip()
            if tag:
                tags.append(tag)

    # 개수 제한
    if len(tags) > HASHTAG_MAX_COUNT:
        tags = tags[:HASHTAG_MAX_COUNT]

    logger.info(f"해시태그 생성 완료: {len(tags)}개")
    return tags


def generate_post(
    image_paths: list[str],
    memo: str = "",
) -> dict[str, str | list[str]]:
    """
    사진 + 메모 → AI 블로그 게시물 생성

    Args:
        image_paths: 이미지 파일 경로 리스트
        memo: 사용자 메모 (장소명, 한줄 감상 등)

    Returns:
        {"title": str, "body": str, "hashtags": list[str]}

    Raises:
        ValueError: API 키 미설정 또는 유효한 이미지 없음
        Exception: AI API 호출 실패
    """
    client = _get_client()
    if client is None:
        raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다")

    # 이미지 검증
    validated = _validate_images(image_paths)
    if not validated:
        raise ValueError("유효한 이미지가 없습니다")

    logger.info(f"게시물 생성 시작 — 사진 {len(validated)}장, 메모: {memo[:30] or '(없음)'}")

    # Step 1: 사진 분석
    analysis = _analyze_images(client, validated, memo)

    # Step 2: 초안 생성
    draft = _generate_draft(client, analysis, memo)

    # Step 3: 해시태그 생성
    hashtags = _generate_hashtags(client, draft["title"], draft["body"])

    return {
        "title": draft["title"],
        "body": draft["body"],
        "hashtags": hashtags,
    }
