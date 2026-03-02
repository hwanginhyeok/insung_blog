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
LOG_PATH = LOGS_DIR / "commenter.log"
COOKIES_PATH = COOKIES_DIR / "naver_cookies.json"

# 네이버 URL
NAVER_LOGIN_URL = "https://nid.naver.com/nidlogin.login"
BLOG_COMMENT_ADMIN_URL = "https://admin.blog.naver.com/{blog_id}/comment"
BLOG_POST_LIST_URL = "https://blog.naver.com/PostList.naver?blogId={blog_id}&categoryNo=0"
BLOG_POST_URL = "https://blog.naver.com/{blog_id}/{log_no}"

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
PAGE_LOAD_TIMEOUT = 30_000
ELEMENT_TIMEOUT = 10_000

# ── 발행 (Phase 2) ──────────────────────────────

# 네이버 글쓰기 URL
BLOG_WRITE_URL = "https://blog.naver.com/{blog_id}/postwrite"

# AI 모델
CONTENT_AI_MODEL = "claude-sonnet-4-6-20250514"   # Vision + 초안 생성
HASHTAG_AI_MODEL = "claude-haiku-4-5-20251001"    # 해시태그 생성

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

# 발행 Playwright 타임아웃 (ms)
EDITOR_LOAD_TIMEOUT = 60_000
IMAGE_UPLOAD_TIMEOUT = 30_000
PUBLISH_CONFIRM_TIMEOUT = 15_000
