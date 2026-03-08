"""
사진 마커 유틸리티 — AI 본문 속 [PHOTO_N] 마커 파싱/렌더링/제거

사용 흐름:
  1. AI가 본문에 [PHOTO_1], [PHOTO_2] 마커를 삽입
  2. split_body_by_markers(body) → 세그먼트 리스트로 분리
  3. render_html_segments(body, image_paths) → 마커를 <img>로 치환한 HTML
  4. strip_markers(body) → 마커 제거 (publisher용)

엣지 케이스:
  - 마커 > 사진 수 → 초과 마커 제거
  - 사진 > 마커 수 → 남은 사진 본문 끝에 추가
  - 마커 0개 → 기존 동작 (사진 전부 상단 배치)
"""
import base64
import mimetypes
import re
from pathlib import Path

from src.utils.logger import logger

# [PHOTO_1], [PHOTO_2], ... 패턴 (1-indexed, 단독 줄)
PHOTO_MARKER_PATTERN = re.compile(r"\[PHOTO_(\d+)\]")


def split_body_by_markers(body: str) -> list[dict]:
    """본문을 마커 기준으로 세그먼트 리스트로 분리.

    Returns:
        [{"type": "text", "content": "..."}, {"type": "photo", "index": 0}, ...]
        index는 0-based (이미지 리스트의 인덱스)
    """
    segments: list[dict] = []
    last_end = 0

    for match in PHOTO_MARKER_PATTERN.finditer(body):
        # 마커 앞 텍스트
        text_before = body[last_end:match.start()]
        if text_before.strip():
            segments.append({"type": "text", "content": text_before.strip()})

        # 마커 → 0-based 인덱스
        photo_num = int(match.group(1))
        segments.append({"type": "photo", "index": photo_num - 1})
        last_end = match.end()

    # 마커 뒤 남은 텍스트
    remaining = body[last_end:]
    if remaining.strip():
        segments.append({"type": "text", "content": remaining.strip()})

    return segments


def _img_tag(img_path: str) -> str:
    """이미지를 base64로 인코딩하여 <img> 태그 반환.

    파일이 없으면 alt 텍스트만 있는 placeholder 반환.
    """
    path = Path(img_path)
    if not path.exists():
        logger.warning(f"이미지 파일 없음: {img_path}")
        return '<div class="photo"><p>[이미지 없음]</p></div>'

    mime_type = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    b64_data = base64.b64encode(path.read_bytes()).decode("utf-8")
    return (
        f'<div class="photo">'
        f'<img src="data:{mime_type};base64,{b64_data}" alt="사진">'
        f'</div>'
    )


def render_html_segments(body: str, image_paths: list[str]) -> str:
    """마커를 <img> 태그로 치환한 HTML 반환.

    마커 없으면 사진 상단 + 본문 하단 (기존 동작 폴백).

    Args:
        body: AI 생성 본문 ([PHOTO_N] 마커 포함 가능)
        image_paths: 이미지 파일 경로 리스트

    Returns:
        사진+텍스트 교차 배치된 HTML 문자열
    """
    segments = split_body_by_markers(body)
    has_markers = any(seg["type"] == "photo" for seg in segments)

    # 마커 없으면 기존 동작: 사진 상단 + 본문 하단
    if not has_markers:
        logger.debug("마커 없음 — 사진 상단 배치 폴백")
        parts: list[str] = []
        for img_path in image_paths:
            parts.append(_img_tag(img_path))
        for line in body.split("\n"):
            line = line.strip()
            if line:
                parts.append(f"<p>{line}</p>")
        return "\n".join(parts)

    # 마커 있으면 교차 배치
    used_indices: set[int] = set()
    html_parts: list[str] = []
    num_images = len(image_paths)

    for seg in segments:
        if seg["type"] == "text":
            for line in seg["content"].split("\n"):
                line = line.strip()
                if line:
                    html_parts.append(f"<p>{line}</p>")
        elif seg["type"] == "photo":
            idx = seg["index"]
            if 0 <= idx < num_images:
                html_parts.append(_img_tag(image_paths[idx]))
                used_indices.add(idx)
            else:
                logger.warning(f"마커 [PHOTO_{idx + 1}] — 사진 없음 (총 {num_images}장), 건너뜀")

    # 마커에 포함되지 않은 사진 → 본문 끝에 추가
    for i in range(num_images):
        if i not in used_indices:
            html_parts.append(_img_tag(image_paths[i]))
            logger.debug(f"사진 {i + 1} — 마커 없어 본문 끝에 추가")

    return "\n".join(html_parts)


def strip_markers(body: str) -> str:
    """본문에서 모든 [PHOTO_N] 마커 제거 (publisher용).

    마커가 단독 줄이면 빈 줄도 정리.
    """
    # 단독 줄 마커 제거 (앞뒤 공백 포함)
    cleaned = re.sub(r"^\s*\[PHOTO_\d+\]\s*$", "", body, flags=re.MULTILINE)
    # 연속 빈 줄 → 단일 빈 줄
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()
