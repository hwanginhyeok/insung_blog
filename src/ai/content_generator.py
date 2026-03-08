"""
AI 콘텐츠 생성 모듈 — Claude Vision으로 사진 분석 후 블로그 초안 생성

사용 흐름:
  1. generate_post(image_paths, memo) 호출
  2. memo_parser.parse_memo() — 메모를 구조화된 데이터로 파싱
  3. _analyze_images() — Vision으로 사진 내용 파악
  4. _detect_category() — 카테고리 자동 감지 (파싱된 메모 활용)
  5. _generate_draft() — PRODUCTION_SPEC + few-shot 예시로 제목+본문 생성
  6. _generate_hashtags() — Haiku로 3계층 해시태그 생성
  7. 반환: {"title": str, "body": str, "hashtags": list[str], "category": str}
"""
import base64
import json
import mimetypes
import os
import re
import random
from pathlib import Path

from anthropic import Anthropic

from config.settings import (
    CATEGORIES,
    CONTENT_AI_MODEL,
    DEFAULT_CATEGORY,
    EXAMPLE_POSTS_COUNT,
    EXAMPLE_POSTS_PATH,
    HASHTAG_AI_MODEL,
    HASHTAG_MAX_COUNT,
    HASHTAG_MIN_COUNT,
    MAX_IMAGE_SIZE_MB,
    MAX_IMAGES,
    POST_BODY_MAX_CHARS,
    POST_BODY_MIN_CHARS,
    POST_TITLE_MAX_CHARS,
    PRODUCTION_SPEC_PATH,
    RAW_CATEGORY_MAP,
    SUPPORTED_IMAGE_TYPES,
)
from src.ai.memo_parser import ParsedMemo, memo_to_prompt_context, parse_memo
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


def _load_example_posts(category: str | None) -> list[dict[str, str]]:
    """카테고리에 맞는 실제 블로그 포스트를 raw_posts.json에서 로드.

    Returns:
        [{"title": str, "body": str}] — 최대 EXAMPLE_POSTS_COUNT개
    """
    if not category or not EXAMPLE_POSTS_PATH.exists():
        return []

    try:
        raw_data = json.loads(EXAMPLE_POSTS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.debug(f"예시 포스트 로드 실패: {e}")
        return []

    # raw 카테고리 → 5대 카테고리 매핑 후 필터링
    matched = []
    for post in raw_data.get("posts", []):
        raw_cat = post.get("category", "")
        mapped_cat = RAW_CATEGORY_MAP.get(raw_cat, DEFAULT_CATEGORY)
        if mapped_cat == category and post.get("body"):
            matched.append({
                "title": post.get("title", ""),
                "body": post["body"],
            })

    if not matched:
        return []

    # 랜덤으로 N개 선택 (매번 다른 예시로 다양성 확보)
    selected = random.sample(matched, min(len(matched), EXAMPLE_POSTS_COUNT))
    logger.info(f"few-shot 예시 {len(selected)}편 로드 (카테고리: {category})")
    return selected


def _load_production_spec() -> str:
    """PRODUCTION_SPEC.md 로드 (섹션 1~12 — 전체 흐름 예시 제외)."""
    if not PRODUCTION_SPEC_PATH.exists():
        logger.warning(f"PRODUCTION_SPEC 없음: {PRODUCTION_SPEC_PATH}")
        return ""

    full_text = PRODUCTION_SPEC_PATH.read_text(encoding="utf-8")

    # 섹션 13 (전체 흐름 예시) 이전까지만 포함 — 토큰 절약
    marker = "## 13. 전체 흐름 예시"
    idx = full_text.find(marker)
    if idx > 0:
        spec = full_text[:idx].rstrip()
    else:
        spec = full_text

    logger.info(f"PRODUCTION_SPEC 로드 완료 ({len(spec)}자)")
    return spec


def _load_spec_example(category: str) -> str:
    """PRODUCTION_SPEC.md 섹션 13에서 카테고리에 맞는 예시 1개 추출."""
    if not PRODUCTION_SPEC_PATH.exists():
        return ""

    full_text = PRODUCTION_SPEC_PATH.read_text(encoding="utf-8")
    marker = "## 13. 전체 흐름 예시"
    idx = full_text.find(marker)
    if idx < 0:
        return ""

    examples_section = full_text[idx:]

    # 카테고리 → 예시 매핑
    cat_to_example = {
        "맛집": "### 예시 A: 맛집 후기",
        "리뷰": "### 예시 C: 제품 리뷰",
        "체험/일상": "### 예시 E: 체험/일상",
        "개인이벤트": "### 예시 E: 체험/일상",  # 가장 유사한 예시로 폴백
    }

    # 카페 후기는 맛집 카테고리지만 별도 예시 존재
    example_header = cat_to_example.get(category, "### 예시 A: 맛집 후기")

    start = examples_section.find(example_header)
    if start < 0:
        return ""

    # 다음 ### 헤더까지 추출
    next_header = examples_section.find("\n### ", start + len(example_header))
    if next_header > 0:
        example = examples_section[start:next_header].strip()
    else:
        # 마지막 예시면 끝까지
        end_marker = examples_section.find("\n---\n", start + len(example_header))
        if end_marker > 0:
            example = examples_section[start:end_marker].strip()
        else:
            example = examples_section[start:start + 2000].strip()

    logger.debug(f"PRODUCTION_SPEC 예시 로드: {example_header} ({len(example)}자)")
    return example


def _detect_category(client: Anthropic, analysis: str, memo: str) -> str:
    """사진 분석 결과로 카테고리 자동 감지 (Haiku, max_tokens=10)"""
    categories_str = ", ".join(CATEGORIES)
    prompt = (
        f"아래 사진 분석 결과를 보고, 블로그 카테고리를 하나만 골라줘.\n"
        f"선택지: {categories_str}\n"
        f"카테고리 이름만 출력해. 다른 텍스트 절대 금지.\n\n"
        f"[사진 분석]\n{analysis[:500]}"
    )
    if memo:
        prompt += f"\n[메모] {memo}"

    try:
        response = client.messages.create(
            model=CONTENT_AI_MODEL,
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # 응답에서 카테고리명 추출 (공백, 구두점 제거)
        for cat in CATEGORIES:
            if cat in raw:
                logger.info(f"카테고리 감지: {cat}")
                return cat
        logger.warning(f"카테고리 감지 실패 (응답: {raw}), 기본값 사용")
    except Exception as e:
        logger.warning(f"카테고리 감지 오류: {e}")

    return DEFAULT_CATEGORY


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


def _analyze_images(client: Anthropic, image_paths: list[Path]) -> str:
    """Claude Vision으로 사진 분석 — 메모 없이 사진만 객관적 분석"""
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

    num_photos = len(image_paths)
    prompt = (
        f"사진 {num_photos}장을 각각 번호를 매겨 분석해줘. "
        "사진에 보이는 것만 묘사하고, 추측하지 마.\n\n"
        "각 사진을 아래 형식으로 분석:\n"
        "사진 1: [장소/음식/분위기/디테일]\n"
        "사진 2: [장소/음식/분위기/디테일]\n"
        "...\n\n"
        "분석 항목:\n"
        "1. 장소 종류 (카페, 식당, 집, 야외 등)\n"
        "2. 음식이 있다면 외관 묘사 (색깔, 형태, 그릇/용기)\n"
        "3. 전반적인 분위기/인테리어\n"
        "4. 눈에 띄는 디테일"
    )

    content.append({"type": "text", "text": prompt})

    response = client.messages.create(
        model=CONTENT_AI_MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": content}],
    )
    analysis = response.content[0].text.strip()
    logger.info(f"사진 분석 완료 ({len(analysis)}자)")
    return analysis


def _parse_draft_json(raw: str) -> tuple[str, str]:
    """AI 초안 출력에서 title과 body를 추출. 여러 폴백 전략 적용.

    AI가 반환할 수 있는 비정상 형태:
    1. 정상: {"title": "제목", "body": "본문"}
    2. 중첩 객체: {"title":{"body": "제목"}}\n\n{"body": "본문"}
    3. 복수 JSON: {"title": "제목"}\n{"body": "본문"}
    4. 코드블록 래핑: ```json\n{...}\n```

    Returns:
        (title, body) 튜플

    Raises:
        ValueError: 모든 폴백 실패 시
    """
    # 코드블록 래핑 제거
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        if lines[-1].strip() == "```":
            cleaned = "\n".join(lines[1:-1])
        else:
            cleaned = "\n".join(lines[1:])

    # ── 1차: 표준 JSON 파싱 ──
    try:
        result = json.loads(cleaned)
        title = result.get("title", "")
        body = result.get("body", "")
        if isinstance(title, str) and isinstance(body, str) and title.strip() and body.strip():
            return title.strip(), body.strip()
        logger.warning(f"JSON 파싱 성공했지만 title/body 불완전 — 폴백 시도")
    except json.JSONDecodeError:
        logger.warning(f"표준 JSON 파싱 실패 — 폴백 시도")

    # ── 2차: 복수 JSON 객체 분리 파싱 ──
    # {"title":"..."} 와 {"body":"..."} 가 별도 객체로 나뉜 경우
    title = ""
    body = ""
    json_objects = _extract_json_objects(cleaned)
    if json_objects:
        for obj in json_objects:
            if "title" in obj:
                val = obj["title"]
                # 중첩 객체 케이스: {"title": {"body": "실제 제목"}}
                if isinstance(val, dict) and "body" in val:
                    title = str(val["body"]).strip()
                elif isinstance(val, str):
                    title = val.strip()
            if "body" in obj:
                val = obj["body"]
                if isinstance(val, str):
                    body = val.strip()
        if title and body:
            logger.info("폴백 2차(복수 JSON 객체) 성공")
            return title, body

    # ── 3차: Regex 추출 ──
    # "title" 또는 "body" 키의 문자열 값을 직접 추출
    title_match = re.search(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"', cleaned)
    body_match = re.search(r'"body"\s*:\s*"((?:[^"\\]|\\.)*)"', cleaned)
    if not body_match:
        # body가 매우 길면 마지막 "} 까지 탐욕적으로 매칭
        body_match = re.search(r'"body"\s*:\s*"(.*)"', cleaned, re.DOTALL)

    if title_match and body_match:
        title = title_match.group(1).strip()
        body = body_match.group(1).strip()
        # JSON 이스케이프 복원
        for esc, char in [('\\"', '"'), ("\\n", "\n"), ("\\t", "\t"), ("\\\\", "\\")]:
            title = title.replace(esc, char)
            body = body.replace(esc, char)
        if title and body:
            logger.info("폴백 3차(regex) 성공")
            return title, body

    # ── 모든 폴백 실패 ──
    logger.error(f"AI 초안 JSON 파싱 완전 실패 — 원본:\n{raw[:500]}")
    raise ValueError("AI 초안 생성 실패: JSON 형식 오류 (모든 폴백 실패)")


def _extract_json_objects(text: str) -> list[dict]:
    """텍스트에서 JSON 객체들을 순서대로 추출. 중첩 브레이스 처리."""
    objects = []
    i = 0
    while i < len(text):
        if text[i] == "{":
            depth = 0
            start = i
            in_string = False
            escape_next = False
            for j in range(i, len(text)):
                c = text[j]
                if escape_next:
                    escape_next = False
                    continue
                if c == "\\":
                    escape_next = True
                    continue
                if c == '"' and not escape_next:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            obj = json.loads(text[start : j + 1])
                            if isinstance(obj, dict):
                                objects.append(obj)
                        except json.JSONDecodeError:
                            pass
                        i = j + 1
                        break
            else:
                i += 1
        else:
            i += 1
    return objects


def _generate_draft(
    client: Anthropic,
    analysis: str,
    parsed_memo: ParsedMemo,
    category: str | None = None,
) -> dict[str, str]:
    """PRODUCTION_SPEC + 파싱된 메모 + few-shot 예시로 제목과 본문 생성"""
    # 1) PRODUCTION_SPEC 로드 (섹션 1~12: 페르소나, 보이스, 이모지, 구조, 금지 등)
    production_spec = _load_production_spec()

    # 2) 카테고리 매칭 예시 (PRODUCTION_SPEC 섹션 13에서 1편)
    spec_example = _load_spec_example(category or DEFAULT_CATEGORY)

    # 3) 실제 블로그 글 few-shot 예시 (raw_posts.json에서)
    examples = _load_example_posts(category)
    examples_block = ""
    if examples:
        examples_block = "\n\n=== 실제 블로그 글 예시 (이 톤과 문체를 그대로 모방해) ===\n"
        for i, ex in enumerate(examples, 1):
            body_preview = ex["body"][:800]
            examples_block += (
                f"\n--- 예시 {i} ---\n"
                f"제목: {ex['title']}\n"
                f"본문:\n{body_preview}\n"
            )
        examples_block += "\n=== 예시 끝 ===\n"

    # 4) 메모 컨텍스트 구조화
    memo_context = memo_to_prompt_context(parsed_memo)

    system_prompt = f"""\
너는 네이버 블로그 "유유베어"야. 아래 제작 스펙을 **반드시 준수**하여 블로그 게시물을 작성해.
이 스펙은 "참고"가 아닌 "준수"할 규칙서다. 여기에 없는 표현은 쓰지 말고, 여기에 있는 표현은 반드시 쓴다.

{production_spec}

=== 카테고리별 전체 흐름 예시 (입력→출력 매핑 참고) ===
{spec_example}
=== 예시 끝 ===
{examples_block}

=== 최종 출력 규칙 ===
- 제목은 {POST_TITLE_MAX_CHARS}자 이내
- 본문은 {POST_BODY_MIN_CHARS}~{POST_BODY_MAX_CHARS}자
- body에 줄바꿈은 \\n으로 표현
- 사진 위치를 [PHOTO_1], [PHOTO_2], ... 마커로 표시 (반드시 단독 줄에 배치)
- 사진 분석의 번호와 마커 번호를 일치시킬 것 (사진 1 → [PHOTO_1])
- 각 마커 앞뒤로 해당 사진에 대한 코멘터리 2~4줄 작성
- 출력 형식: 반드시 아래 JSON만 출력. 인사말, 설명, 마크다운 등 다른 텍스트 절대 금지.
{{"title": "제목", "body": "본문"}}"""

    # 유저 메시지: 사진 분석 + 구조화된 메모
    user_message = f"[사진 분석 결과]\n{analysis}"
    if memo_context:
        user_message += f"\n\n[구조화된 메모 정보]\n{memo_context}"
    if parsed_memo.raw:
        user_message += f"\n\n[원본 메모]\n{parsed_memo.raw}"

    response = client.messages.create(
        model=CONTENT_AI_MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": '{"title":'},
        ],
    )
    raw = '{"title":' + response.content[0].text.strip()

    title, body = _parse_draft_json(raw)
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
        {"title": str, "body": str, "hashtags": list[str], "category": str}

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

    # Step 0: 메모 파싱 (구조화)
    parsed_memo = parse_memo(memo)

    # Step 1: 사진 분석 (메모 없이 객관적으로)
    analysis = _analyze_images(client, validated)

    # Step 2: 카테고리 감지
    category = _detect_category(client, analysis, memo)

    # Step 3: PRODUCTION_SPEC 기반 초안 생성
    draft = _generate_draft(client, analysis, parsed_memo, category)

    # Step 4: 해시태그 생성
    hashtags = _generate_hashtags(client, draft["title"], draft["body"])

    return {
        "title": draft["title"],
        "body": draft["body"],
        "hashtags": hashtags,
        "category": category,
    }
