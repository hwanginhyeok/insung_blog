"""
모든 상수 및 설정값 중앙 관리
"""
from pathlib import Path

# 프로젝트 루트
PROJECT_ROOT = Path(__file__).parent.parent

# 경로
DATA_DIR = PROJECT_ROOT / "data"
LOGS_DIR = PROJECT_ROOT / "logs"
COOKIES_DIR = PROJECT_ROOT / "cookies"

DB_PATH = DATA_DIR / "comments.db"
COOKIES_PATH = COOKIES_DIR / "naver_cookies.json"


def get_db_path(user_id: str) -> Path:
    """유저별 SQLite DB 경로 반환. data/{user_id[:8]}/comments.db"""
    return DATA_DIR / user_id[:8] / "comments.db"


def get_cookies_path(user_id: str) -> Path:
    """유저별 쿠키 파일 경로 반환. cookies/{user_id[:8]}_naver.json"""
    return COOKIES_DIR / f"{user_id[:8]}_naver.json"

# 모듈별 로그 경로
LOG_PATH = LOGS_DIR / "commenter.log"
LOG_PATH_COMMENTER = LOGS_DIR / "commenter.log"
LOG_PATH_TELEGRAM = LOGS_DIR / "telegram_bot.log"
LOG_PATH_API = LOGS_DIR / "api_server.log"
LOG_PATH_PUBLISHER = LOGS_DIR / "publisher.log"

# 네이버 URL
NAVER_LOGIN_URL = "https://nid.naver.com/nidlogin.login"
BLOG_COMMENT_ADMIN_URL = "https://admin.blog.naver.com/{blog_id}/comment"
BLOG_POST_LIST_URL = "https://blog.naver.com/PostList.naver?blogId={blog_id}&categoryNo=0"
BLOG_POST_URL = "https://blog.naver.com/{blog_id}/{log_no}"

# 모바일 (댓글 수집용 — 데스크톱 cbox JS 미로드 대응)
MOBILE_BLOG_POST_URL = "https://m.blog.naver.com/{blog_id}/{log_no}"
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/16.6 Mobile/15E148 Safari/604.1"
)
MOBILE_VIEWPORT = {"width": 390, "height": 844}
COMMENT_LOAD_WAIT = 5  # 댓글 lazy-load 대기 (초)

# 일일 한도
MAX_BLOGGERS_PER_DAY = 10       # 하루 최대 방문 블로거 수
MAX_COMMENTS_PER_DAY = 30       # 하루 최대 총 댓글 수 (봇 감지 방지)
POSTS_PER_BLOGGER_MIN = 3       # 블로거당 최소 댓글 게시물
POSTS_PER_BLOGGER_MAX = 5       # 블로거당 최대 댓글 게시물
COMMENT_ADMIN_MAX_PAGES = 3     # 댓글 관리자 최대 페이지 수

# 게시물 나이 제한
MAX_POST_AGE_DAYS = 90          # 댓글 대상 게시물 최대 나이 (일)

# 허용 시간대 (시) — 블로그 접속자 많은 저녁~자정
ALLOWED_HOUR_START = 20
ALLOWED_HOUR_END = 24

# 스케줄 실행 시각
SCHEDULE_TIME = "20:30"
SCHEDULE_RANDOM_OFFSET_MAX = 30  # 실행 시각 랜덤 오프셋 최대값 (±분)

# 딜레이 (초)
DELAY_BETWEEN_COMMENTS_MIN = 5
DELAY_BETWEEN_COMMENTS_MAX = 15
DELAY_BETWEEN_BLOGGERS_MIN = 30
DELAY_BETWEEN_BLOGGERS_MAX = 60
DELAY_TYPING_MIN = 0.05          # 글자당 타이핑 딜레이 (초)
DELAY_TYPING_MAX = 0.15

# 재시도
MAX_LOGIN_RETRIES = 3
MAX_POST_RETRIES = 2

# 제목 최대 길이 (초과 시 자름)
TITLE_MAX_LEN = 20

# Playwright 타임아웃 (ms)
PAGE_LOAD_TIMEOUT = 60_000  # 네이버 블로그 페이지 로드 느림 대응
ELEMENT_TIMEOUT = 10_000

# ── 발행 (Phase 2) ──────────────────────────────

# 네이버 글쓰기 URL
BLOG_WRITE_URL = "https://blog.naver.com/{blog_id}/postwrite"

# AI 모델
CONTENT_AI_MODEL = "claude-haiku-4-5-20251001"    # Vision + 초안 생성 (Sonnet 접근 불가하여 Haiku 사용)
HASHTAG_AI_MODEL = "claude-haiku-4-5-20251001"    # 해시태그 생성
COMMENT_AI_MODEL = "claude-haiku-4-5-20251001"    # 댓글 생성

# 이미지 제약
MAX_IMAGES = 10
MAX_IMAGE_SIZE_MB = 20
SUPPORTED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

# 본문 길이 (자)
POST_BODY_MIN_CHARS = 300
POST_BODY_MAX_CHARS = 1500
POST_TITLE_MAX_CHARS = 40

# 해시태그
HASHTAG_MIN_COUNT = 15
HASHTAG_MAX_COUNT = 25

# 글쓰기 스타일 가이드 경로
WRITING_STYLE_PATH = PROJECT_ROOT / "skills" / "writing_style.md"
PRODUCTION_SPEC_PATH = PROJECT_ROOT / "skills" / "PRODUCTION_SPEC.md"

# ── 카테고리별 스타일 시스템 ──────────────────────────
STYLE_GUIDES_DIR = PROJECT_ROOT / "skills" / "styles"
CATEGORIES = ("맛집", "체험/일상", "재테크", "리뷰", "개인이벤트")
DEFAULT_CATEGORY = "체험/일상"
FONT_CONFIG_PATH = STYLE_GUIDES_DIR / "_font_config.json"
EXAMPLE_POSTS_PATH = PROJECT_ROOT / "skills" / "blog_analysis" / "raw_posts.json"
EXAMPLE_POSTS_COUNT = 2  # few-shot에 포함할 예시 포스트 수

# raw_posts.json 카테고리 → 5대 카테고리 매핑
RAW_CATEGORY_MAP: dict[str, str] = {
    "음식점": "맛집",
    "술집": "맛집",
    "카페": "맛집",
    "인천": "맛집",
    "체험": "체험/일상",
    "기타": "체험/일상",
    "재테크": "재테크",
    "제품리뷰": "리뷰",
    "임신준비": "개인이벤트",
    "신혼여행": "개인이벤트",
    "결혼준비": "개인이벤트",
}

# 발행 Playwright 타임아웃 (ms)
EDITOR_LOAD_TIMEOUT = 60_000
IMAGE_UPLOAD_TIMEOUT = 30_000
PUBLISH_CONFIRM_TIMEOUT = 15_000
DRAFT_SAVE_TIMEOUT = 10_000  # 임시저장 확인 대기

# ── 오토 블로거 감지 설정 ──────────────────────────
# 1분 내 답글을 "빠른 답글"로 간주 (초)
AUTO_BLOGGER_FAST_REPLY_THRESHOLD = 60

# 의심 점수 기준
AUTO_BLOGGER_SCORE_HIGH = 70   # 이 점수 이상: 항상 스킵
AUTO_BLOGGER_SCORE_LOW = 40    # 이 점수 이상: 30% 확률 스킵

# 패턴 분석에 필요한 최소 댓글 수
AUTO_BLOGGER_MIN_COMMENTS_FOR_ANALYSIS = 3

# 답글 패턴 감지용 정규식
AUTO_BLOGGER_PATTERNS = [
    r"^안녕하세요[.!]?\\s*\\w*님",
    r"^반갑습니다[.!]?",
    r"좋은\\s*(글|포스팅|내용)",
    r"잘\\s*보고\\s*갑니다",
    r"소통\\s*하고\\s*갑니다",
    r"서로\\s*(소통|공감|방문)",
    r"댓글\\s*남기고\\s*갑니다",
    r"인사\\s*드리고\\s*갑니다",
    r"방문\\s*하고\\s*갑니다",
    r"구독하고\\s*갑니다",
]

# 스팸 지표
# ── 이웃 발견/방문 설정 ──────────────────────────
NAVER_BLOG_SEARCH_URL = "https://search.naver.com/search.naver?ssc=tab.blog&query={keyword}"
MAX_DISCOVER_PER_KEYWORD = 20       # 키워드당 최대 발견 블로거 수
MAX_DISCOVER_TOTAL = 50             # 1회 실행 시 최대 발견 수
MAX_NEIGHBOR_VISITS_PER_RUN = 5     # 1회 방문 시 최대 이웃 수
NEIGHBOR_VISIT_INTERVAL_DAYS = 7    # 재방문 최소 간격 (일)
NEIGHBOR_SKIP_BLOG_IDS = frozenset(["PostList", "PostView", "BlogHome", "NBlogOfficialBlog"])

AUTO_BLOGGER_SPAM_INDICATORS = [
    "http://",
    "https://",
    "상위노출",
    "검색순위",
    "블로그체험단",
    "체험단모집",
    "원고료",
    "협찬문의",
]
