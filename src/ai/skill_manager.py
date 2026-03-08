"""
피드백 → 글쓰기 스킬 자동 업데이트

사용 흐름:
  1. 사용자가 텔레그램으로 피드백 전송
  2. record_feedback(post_title, feedback_text) 호출
  3. skills/writing_style.md 하단 피드백 이력에 기록
  4. 피드백 5건마다 AI가 패턴 분석 → 스타일 규칙 제안
"""
import os
import re
from datetime import datetime
from pathlib import Path

from anthropic import Anthropic

# 피드백 분석에도 Haiku 사용 (HASHTAG_AI_MODEL 재사용 — 동일 경량 모델)
from config.settings import HASHTAG_AI_MODEL, STYLE_GUIDES_DIR, WRITING_STYLE_PATH
from src.utils.logger import logger

_client: Anthropic | None = None

_FEEDBACK_TABLE_HEADER = "| 날짜 | 게시물 | 피드백 요점 |"
_FEEDBACK_TABLE_SEP = "|------|--------|-------------|"


def _get_client() -> Anthropic | None:
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    _client = Anthropic(api_key=api_key)
    return _client


def _resolve_style_path(category: str | None = None) -> Path:
    """카테고리에 따라 피드백을 기록할 스타일 파일 경로 결정"""
    if category:
        cat_path = STYLE_GUIDES_DIR / f"{category}.md"
        if cat_path.exists():
            return cat_path
    return WRITING_STYLE_PATH


def record_feedback(
    post_title: str,
    feedback_text: str,
    category: str | None = None,
) -> bool:
    """
    피드백을 스타일 가이드에 기록. 카테고리가 있으면 해당 카테고리 파일에 기록.

    Args:
        post_title: 피드백 대상 게시물 제목
        feedback_text: 사용자 피드백 원문
        category: 게시물 카테고리 (맛집/카페/여행/일상)

    Returns:
        성공 여부
    """
    style_path = _resolve_style_path(category)
    if not style_path.exists():
        logger.warning(f"스타일 파일 없음: {style_path}")
        return False

    content = style_path.read_text(encoding="utf-8")
    target_name = f"{category} 스타일" if category else "기본 스타일"
    logger.info(f"피드백 대상 스타일: {target_name} ({style_path.name})")
    today = datetime.now().strftime("%Y-%m-%d")

    # 피드백 핵심 요약 (긴 피드백은 50자로 자름)
    summary = feedback_text.strip()
    if len(summary) > 50:
        summary = summary[:47] + "..."

    new_row = f"| {today} | {post_title[:20]} | {summary} |"

    # 피드백 이력 테이블 끝에 추가
    if _FEEDBACK_TABLE_SEP in content:
        # 테이블이 이미 있으면 마지막 행 뒤에 추가
        lines = content.split("\n")
        insert_idx = None
        for i, line in enumerate(lines):
            if _FEEDBACK_TABLE_SEP in line:
                # 테이블 구분선 아래 마지막 데이터 행 찾기
                insert_idx = i + 1
                while insert_idx < len(lines) and lines[insert_idx].startswith("|"):
                    insert_idx += 1
                break

        if insert_idx is not None:
            lines.insert(insert_idx, new_row)
            content = "\n".join(lines)
    else:
        # 테이블이 없으면 파일 끝에 추가
        content += f"\n\n## 피드백 이력\n\n{_FEEDBACK_TABLE_HEADER}\n{_FEEDBACK_TABLE_SEP}\n{new_row}\n"

    style_path.write_text(content, encoding="utf-8")
    logger.info(f"피드백 기록 완료: {post_title[:20]} — {summary[:30]}")

    # 피드백 개수 체크 → 5건마다 스타일 규칙 제안
    feedback_count = _count_feedback_rows(content)
    if feedback_count > 0 and feedback_count % 5 == 0:
        _suggest_style_update(content)

    return True


def _count_feedback_rows(content: str) -> int:
    """피드백 이력 테이블의 데이터 행 수 (날짜 패턴으로 실제 데이터 행만 카운트)"""
    date_pattern = re.compile(r"^\|\s*\d{4}-\d{2}-\d{2}\s*\|")
    count = 0
    in_table = False
    for line in content.split("\n"):
        if _FEEDBACK_TABLE_SEP in line:
            in_table = True
            continue
        if in_table:
            if date_pattern.match(line):
                count += 1
            elif not line.strip():
                break
    return count


def _suggest_style_update(content: str) -> None:
    """AI가 피드백 패턴을 분석해 스타일 규칙 제안 (로그에 출력)"""
    client = _get_client()
    if client is None:
        return

    try:
        response = client.messages.create(
            model=HASHTAG_AI_MODEL,
            max_tokens=300,
            system="너는 블로그 글쓰기 코치야. 피드백 이력을 보고 반복되는 패턴을 1~3줄로 요약해줘. 구체적인 개선 포인트만 간결하게.",
            messages=[{
                "role": "user",
                "content": f"아래 글쓰기 스타일 가이드와 피드백 이력을 분석해서, 추가하면 좋을 규칙을 제안해줘.\n\n{content}",
            }],
        )
        suggestion = response.content[0].text.strip()
        logger.info(f"[스킬 매니저] 스타일 개선 제안:\n{suggestion}")
    except Exception as e:
        logger.debug(f"스타일 제안 생성 실패: {e}")
