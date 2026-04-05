"""
댓글 후처리 모듈

생성된 AI 댓글에 적용하는 후처리 규칙:
  - 이모지 최대 2개 제한 (초과분 제거)
  - ㅎㅎ/ㅋㅋ 반복 패턴 정규화 (ㅎㅎㅎㅎ → ㅎㅎ, ㅋㅋㅋㅋ → ㅋㅋ)
  - 마침표 스타일 통일 (이모지/ㅎㅎ/ㅋㅋ 뒤 마침표 제거)
"""
import re
import unicodedata


# 이모지 판별: Unicode 카테고리 So(Other Symbol) + 이모지 범위
def _is_emoji(char: str) -> bool:
    """단일 문자가 이모지인지 판별."""
    cp = ord(char)
    # 일반 이모지 범위
    if (
        0x1F300 <= cp <= 0x1F9FF  # 기상/식물/동물/음식/여행/물건/기호/보충
        or 0x2600 <= cp <= 0x26FF  # 잡동사니 기호
        or 0x2700 <= cp <= 0x27BF  # 딩뱃
        or 0xFE00 <= cp <= 0xFE0F  # 이형 선택자
        or 0x1F000 <= cp <= 0x1F02F  # 마작
        or 0x1F0A0 <= cp <= 0x1F0FF  # 카드
        or 0x1FA00 <= cp <= 0x1FA6F  # 체스
        or 0x1FA70 <= cp <= 0x1FAFF  # 보충 기호
        or 0x200D == cp              # 제로폭 결합자
        or 0x20E3 == cp              # 결합 둘러싸기 키캡
    ):
        return True
    cat = unicodedata.category(char)
    return cat in ("So", "Sm")


def _extract_emoji_positions(text: str) -> list[int]:
    """텍스트에서 이모지 문자의 시작 인덱스 목록 반환."""
    positions = []
    i = 0
    while i < len(text):
        char = text[i]
        if _is_emoji(char):
            positions.append(i)
            # ZWJ 시퀀스 등 연속 이모지 구성 문자는 하나로 취급
            j = i + 1
            while j < len(text) and (
                _is_emoji(text[j])
                or ord(text[j]) in (0x200D, 0xFE0F, 0x20E3)
            ):
                j += 1
            i = j
        else:
            i += 1
    return positions


def _limit_emojis(text: str, max_count: int = 2) -> str:
    """이모지를 최대 max_count개로 제한. 초과분은 제거."""
    emoji_count = 0
    result = []
    i = 0
    while i < len(text):
        char = text[i]
        if _is_emoji(char):
            # ZWJ 시퀀스 등 연속 이모지 구성 문자를 하나의 이모지로 수집
            seq = [char]
            j = i + 1
            while j < len(text) and (
                _is_emoji(text[j])
                or ord(text[j]) in (0x200D, 0xFE0F, 0x20E3)
            ):
                seq.append(text[j])
                j += 1
            emoji_count += 1
            if emoji_count <= max_count:
                result.extend(seq)
            i = j
        else:
            result.append(char)
            i += 1
    return "".join(result)


def _normalize_laugh_patterns(text: str) -> str:
    """ㅎ/ㅋ 반복 패턴을 2자로 정규화.
    ㅎㅎㅎ+ → ㅎㅎ, ㅋㅋㅋ+ → ㅋㅋ
    단, ㅎ 단독 / ㅋ 단독은 그대로 유지.
    """
    text = re.sub(r'ㅎ{3,}', 'ㅎㅎ', text)
    text = re.sub(r'ㅋ{3,}', 'ㅋㅋ', text)
    return text


def _remove_hashtags(text: str) -> str:
    """해시태그(#단어) 제거. 댓글/답글에 해시태그는 부자연스러움."""
    text = re.sub(r'#\S+', '', text)
    # 해시태그 제거 후 남은 다중 공백 정리
    text = re.sub(r'  +', ' ', text)
    return text.strip()


def _remove_trailing_period(text: str) -> str:
    """이모지, ㅎㅎ, ㅋㅋ 바로 뒤에 오는 마침표(.) 또는 느낌표 중복 제거.
    규칙: 이모지/ㅎㅎ/ㅋㅋ 로 끝나는 토큰 뒤에 '.' 또는 '!.' 패턴 제거.
    줄 단위로 처리.
    """
    lines = text.split('\n')
    cleaned = []
    # 마침표 제거 대상 패턴: ㅎㅎ, ㅋㅋ 뒤 마침표
    pattern_laugh = re.compile(r'(ㅎㅎ|ㅋㅋ)\.$')
    for line in lines:
        line = pattern_laugh.sub(r'\1', line)
        # 이모지 문자로 끝나는 줄 뒤의 마침표 제거 (마지막 문자 기준)
        stripped = line.rstrip()
        if stripped.endswith('.') and len(stripped) >= 2:
            char_before_dot = stripped[-2]
            if _is_emoji(char_before_dot):
                line = stripped[:-1] + line[len(stripped):]
        cleaned.append(line)
    return '\n'.join(cleaned)


def process(comment: str) -> str:
    """
    댓글 후처리 파이프라인.

    적용 순서:
      1. ㅎㅎ/ㅋㅋ 반복 패턴 정규화
      2. 이모지 최대 2개 제한
      3. 마침표 스타일 정리

    Args:
        comment: 원본 댓글 문자열

    Returns:
        후처리된 댓글 문자열
    """
    if not comment:
        return comment

    comment = _normalize_laugh_patterns(comment)
    comment = _remove_hashtags(comment)
    comment = _limit_emojis(comment, max_count=2)
    comment = _remove_trailing_period(comment)

    return comment
