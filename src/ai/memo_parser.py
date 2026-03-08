"""
메모 파서 — 텔레그램 캡션(메모)을 구조화된 데이터로 변환

사용 흐름:
  1. 사용자가 텔레그램으로 사진 + 메모를 전송
  2. parse_memo(raw_text) 호출
  3. ParsedMemo 반환 (장소명, 위치, 메뉴, 평점, 협찬 여부 등)
  4. content_generator.py가 구조화된 데이터로 정밀한 프롬프트 구성

메모 형식 (INPUT_GUIDE.md 기준):
  장소명, 지역
  누구와, 계기
  주소: 전체주소 (선택)
  영업: 요일 시간 (선택)
  전화: 번호 (선택)
  메뉴1(한줄평)
  메뉴2(한줄평)
  특이점
  N점
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from src.utils.logger import logger

# 동행자 키워드 → 자기지칭 매핑 (PRODUCTION_SPEC 12-2)
_COUPLE_KEYWORDS = {"유유랑", "둘이서", "아내랑", "와이프랑"}
_SOLO_KEYWORDS = {"혼자", "지인과", "친구와", "친구랑", "동료와", "동료랑"}

# 평점 패턴: "3점", "5점", "4.5점" 등
_RATING_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*점")

# 메뉴 한줄평 패턴: "메뉴명(한줄평)" 또는 "메뉴명 (한줄평)"
_MENU_PATTERN = re.compile(r"^(.+?)\s*\((.+)\)\s*$")

# 시리즈 패턴: "시리즈 1편", "N편"
_SERIES_PATTERN = re.compile(r"(?:시리즈\s*)?(\d+)\s*편")

# 사실 정보 접두사 패턴: "주소:", "영업:", "전화:" 등
_FACT_PREFIXES = {
    "주소": "address",
    "위치": "address",       # "위치:" 도 허용
    "영업": "hours",
    "운영": "hours",         # "운영시간:" 도 허용
    "운영시간": "hours",
    "영업시간": "hours",
    "전화": "phone",
    "연락처": "phone",
    "번호": "phone",
}


@dataclass
class MenuItem:
    """메뉴 항목 (이름 + 한줄평)"""
    name: str
    review: str


@dataclass
class ParsedMemo:
    """파싱된 메모 데이터"""
    # 1번째 줄: 주제/장소 + 위치
    subject: str = ""           # 장소명 또는 제품명 또는 주제
    location: str = ""          # 역이름, 지역

    # 2번째 줄: 동행자 + 계기
    companion: str = ""         # "유유랑", "혼자", "친구와" 등
    occasion: str = ""          # "오랜만에 동네 데이트", "점심" 등

    # 메뉴 리스트
    menus: list[MenuItem] = field(default_factory=list)

    # 사실 정보 (메모에 명시된 경우만 — 없으면 빈 문자열, AI가 지어내면 안 됨)
    address: str = ""                    # "주소:" 접두사로 입력
    hours: str = ""                      # "영업:" 접두사로 입력
    phone: str = ""                      # "전화:" 접두사로 입력

    # 메타데이터
    rating: float | None = None         # N점 (없으면 None)
    is_sponsored: bool = False           # "협찬" 포함 여부
    series_number: int | None = None     # 시리즈 N편

    # 자기지칭 힌트 (PRODUCTION_SPEC 12-2)
    self_reference: str = "유유베어"     # "유유베어" | "베어"

    # 기타 정보 (특이점, 하이라이트 등 — 분류 안 된 줄)
    extra_notes: list[str] = field(default_factory=list)

    # 원본
    raw: str = ""


def parse_memo(raw_text: str) -> ParsedMemo:
    """
    텔레그램 메모 텍스트를 구조화된 ParsedMemo로 파싱.

    파싱 규칙 (PRODUCTION_SPEC 12-2 기반):
    - 1번째 줄: 콤마로 분리 → subject, location
    - 2번째 줄: 콤마로 분리 → companion, occasion
    - "협찬" 키워드 → is_sponsored
    - "N점" 패턴 → rating
    - "메뉴(한줄평)" 패턴 → menus
    - 동행자 키워드 → self_reference 결정
    - "시리즈 N편" → series_number
    - 나머지 → extra_notes
    """
    result = ParsedMemo(raw=raw_text)

    if not raw_text or not raw_text.strip():
        logger.debug("메모 비어있음 — 빈 ParsedMemo 반환")
        return result

    lines = [line.strip() for line in raw_text.strip().split("\n") if line.strip()]

    if not lines:
        return result

    # ── 협찬 감지 (전체 텍스트에서) ──
    if "협찬" in raw_text:
        result.is_sponsored = True
        logger.info("메모 파싱: 협찬 감지")

    # ── 1번째 줄: 주제/장소 + 위치 ──
    first_line = lines[0]
    if "," in first_line:
        parts = first_line.split(",", 1)
        result.subject = parts[0].strip()
        result.location = parts[1].strip()
    else:
        result.subject = first_line.strip()

    # ── 나머지 줄 순회 ──
    for i, line in enumerate(lines[1:], start=1):
        # 2번째 줄: 동행자 + 계기 (아직 companion이 비어있을 때)
        if i == 1 and not result.companion:
            if "," in line:
                parts = line.split(",", 1)
                result.companion = parts[0].strip()
                result.occasion = parts[1].strip()
            else:
                # 콤마 없으면 전체를 companion/occasion으로
                result.companion = line.strip()
            # 동행자 키워드로 self_reference 결정
            _set_self_reference(result)
            continue

        # 사실 정보 접두사 감지: "주소:", "영업:", "전화:" 등
        fact_field = _parse_fact_prefix(line)
        if fact_field:
            field_name, value = fact_field
            setattr(result, field_name, value)
            logger.debug(f"메모 파싱: {field_name} = '{value}'")
            continue

        # 메뉴(한줄평) 패턴 — 시리즈/평점보다 먼저 체크 (괄호 안에 "편" 등 오탐 방지)
        menu_match = _MENU_PATTERN.match(line)
        if menu_match:
            menu = MenuItem(
                name=menu_match.group(1).strip(),
                review=menu_match.group(2).strip(),
            )
            result.menus.append(menu)
            logger.debug(f"메모 파싱: 메뉴 '{menu.name}'")
            continue

        # 평점 감지: "N점" (1~5점 범위, 짧은 줄 — "80점 합격" 같은 오탐 방지)
        rating_match = _RATING_PATTERN.search(line)
        if rating_match and len(line) < 10:
            score = float(rating_match.group(1))
            if 1 <= score <= 5:
                result.rating = score
                logger.debug(f"메모 파싱: 평점 {result.rating}점")
                continue

        # 시리즈 감지: "시리즈 N편" (반드시 series_match 존재 확인)
        series_match = _SERIES_PATTERN.search(line)
        if series_match and ("시리즈" in line or line.strip().endswith("편")):
            result.series_number = int(series_match.group(1))
            logger.debug(f"메모 파싱: 시리즈 {result.series_number}편")
            if len(line) < 15:
                continue

        # 나머지 → extra_notes
        result.extra_notes.append(line)

    logger.info(
        f"메모 파싱 완료 — 주제: {result.subject}, "
        f"메뉴: {len(result.menus)}개, "
        f"평점: {result.rating}, "
        f"협찬: {result.is_sponsored}"
    )
    return result


def _parse_fact_prefix(line: str) -> tuple[str, str] | None:
    """사실 정보 접두사 감지. '주소: xxx' → ('address', 'xxx') 반환, 아니면 None."""
    for prefix, field_name in _FACT_PREFIXES.items():
        # "주소:" 또는 "주소 :" 패턴
        if line.startswith(prefix):
            rest = line[len(prefix):].lstrip()
            if rest.startswith(":") or rest.startswith("："):
                value = rest[1:].strip()
                if value:
                    return (field_name, value)
    return None


def _set_self_reference(memo: ParsedMemo) -> None:
    """동행자 키워드로 자기지칭 결정 (PRODUCTION_SPEC 12-2)"""
    companion = memo.companion
    for kw in _COUPLE_KEYWORDS:
        if kw in companion:
            memo.self_reference = "유유베어"
            return
    for kw in _SOLO_KEYWORDS:
        if kw in companion:
            memo.self_reference = "베어"
            return
    # 기본값: 유유베어
    memo.self_reference = "유유베어"


def memo_to_prompt_context(parsed: ParsedMemo) -> str:
    """ParsedMemo를 AI 프롬프트에 삽입할 구조화된 텍스트로 변환."""
    if not parsed.raw:
        return ""

    sections = []

    # 기본 정보
    if parsed.subject:
        sections.append(f"장소/주제: {parsed.subject}")
    if parsed.location:
        sections.append(f"위치/지역: {parsed.location}")
    if parsed.companion:
        sections.append(f"동행: {parsed.companion}")
    if parsed.occasion:
        sections.append(f"방문 계기: {parsed.occasion}")

    # 자기지칭 지시
    sections.append(f"자기지칭: \"{parsed.self_reference}\" 사용 (커플 활동이면 유유베어, 단독이면 베어)")

    # 사실 정보 (주소/영업시간/전화) — 있으면 사용, 없으면 생략 지시
    if parsed.address:
        sections.append(f"주소: {parsed.address}")
    if parsed.hours:
        sections.append(f"운영시간: {parsed.hours}")
    if parsed.phone:
        sections.append(f"전화: {parsed.phone}")

    # 미제공 사실정보 경고 — AI 환각 방지
    missing_facts = []
    if not parsed.address:
        missing_facts.append("주소")
    if not parsed.hours:
        missing_facts.append("운영시간")
    if not parsed.phone:
        missing_facts.append("전화번호")
    if missing_facts:
        sections.append(
            f"⚠ 미제공 정보: {', '.join(missing_facts)} "
            f"→ 이 정보들은 메모에 없으므로 절대 지어내지 마. "
            f"해당 블록(📍위치/⏲운영시간)을 아예 생략해."
        )

    # 협찬 여부
    if parsed.is_sponsored:
        sections.append("협찬: 예 → 협찬 공시 블록 삽입, \"내돈내산\" 제거")
    else:
        sections.append("협찬: 아니오 → \"내돈내산\" 포함")

    # 메뉴 리스트
    if parsed.menus:
        menu_lines = []
        for j, m in enumerate(parsed.menus, 1):
            menu_lines.append(f"  {j}. {m.name} — {m.review}")
        sections.append("주문 메뉴:\n" + "\n".join(menu_lines))

    # 특이점
    if parsed.extra_notes:
        sections.append("특이점/추가정보:\n  " + "\n  ".join(parsed.extra_notes))

    # 평점
    if parsed.rating is not None:
        sections.append(f"평점: {parsed.rating}점")
        if parsed.rating >= 4:
            sections.append("→ 종합 평가 톤: 강추")
        elif parsed.rating >= 3:
            sections.append("→ 종합 평가 톤: 보통/괜찮음")
        else:
            sections.append("→ 종합 평가 톤: 아쉬움/별로")

    # 시리즈
    if parsed.series_number is not None:
        sections.append(f"시리즈: {parsed.series_number}편 → 제목에 [#{parsed.series_number}] 포함, 마무리에 다음 편 예고")

    return "\n".join(sections)
