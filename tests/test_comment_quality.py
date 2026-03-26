"""댓글 품질 검증 테스트 — 카테고리 감지, 유효성 체크, 시작어 추출"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.commenter.ai_comment import (
    _detect_category,
    _extract_starters,
    _is_valid_comment,
)


class TestIsValidComment:
    """_is_valid_comment 유효성 체크"""

    def test_normal_comment(self):
        """120자 정상 댓글 → True"""
        comment = "와 여기 분위기 진짜 좋네요! 사진 보니까 바로 가고 싶어졌어요 ㅎㅎ\n가격도 합리적이고 메뉴도 다양해서 선택 장애 올 것 같아요\n다음에 친구들이랑 꼭 가봐야겠어요 좋은 정보 감사합니다"
        assert _is_valid_comment(comment)

    def test_empty_string(self):
        """빈 문자열 → False"""
        assert not _is_valid_comment("")

    def test_too_short(self):
        """5자 미만 → False"""
        assert not _is_valid_comment("좋아요")

    def test_marketing_pattern(self):
        """'마케팅 글' 포함 → False"""
        assert not _is_valid_comment("이 글은 마케팅 글처럼 보이네요. 조심하세요.")

    def test_advertising_pattern(self):
        """'광고 글' 포함 → False"""
        assert not _is_valid_comment("이건 광고 글인 것 같아요. 실제 후기가 아닌듯.")

    def test_sorry_pattern(self):
        """'죄송' 포함 → False"""
        assert not _is_valid_comment("죄송합니다만 본문을 분석할 수 없습니다.")

    def test_ai_assistant_pattern(self):
        """'AI 어시스턴트' 포함 → False"""
        assert not _is_valid_comment("저는 AI 어시스턴트로서 댓글을 작성합니다.")


class TestDetectCategory:
    """_detect_category 카테고리 감지"""

    def test_food(self):
        assert _detect_category("강남 맛집 추천", "돈까스가 정말 맛있었어요") == "맛집"

    def test_travel(self):
        assert _detect_category("제주도 여행", "바다가 너무 예뻤어요 숙소도 좋고") == "여행"

    def test_it(self):
        assert _detect_category("노트북 추천", "컴퓨터 코딩 개발 프로그램 AI 소프트웨어") == "IT"

    def test_finance(self):
        assert _detect_category("ETF 투자", "배당금으로 재테크하는 방법") == "재테크"

    def test_no_match(self):
        """매칭 안 되면 None"""
        assert _detect_category("abc", "xyz") is None


class TestExtractStarters:
    """_extract_starters 시작어 추출"""

    def test_basic(self):
        comments = ["와 정말 맛있겠다", "진짜 가고 싶어요", "좋은 정보 감사합니다"]
        starters = _extract_starters(comments, count=5)
        assert "와 정" in starters or "와" in starters[0][:2]
        assert len(starters) == 3

    def test_empty(self):
        assert _extract_starters([], count=5) == []

    def test_duplicate_removal(self):
        comments = ["와 대박", "와 진짜", "와 좋다"]
        starters = _extract_starters(comments, count=5)
        assert len(starters) == 1  # "와" 하나만
