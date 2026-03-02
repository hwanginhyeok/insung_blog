# Coding Rules

> CLAUDE.md에서 분리된 상세 코딩 규칙. 코드 작성/수정 시 참조.

## 1. 상수 관리

- **모든 상수는 `config/settings.py`에 단일 정의**. 모듈 파일에 매직 넘버/URL 하드코딩 금지.
- 경로는 `pathlib.Path` 사용. 문자열 경로 금지.
- 숫자 리터럴에 언더스코어 구분기 사용 (`30_000`, `10_000`).
- 설정 import: `from config.settings import CONSTANT_NAME`

## 2. 네이밍 규칙

- **함수**: `snake_case` — 동작 기반 (`collect_posts`, `write_comment`)
- **Private 함수**: `_underscore_prefix` (`_extract_blog_id`, `_is_logged_in`)
- **Boolean 반환 함수**: `is_` / `has_` prefix (`is_logged_in`, `has_textarea`)
- **상수**: `UPPER_SNAKE_CASE` (`MAX_COMMENTS_PER_DAY`)
- **변수**: 리스트는 복수형 (`blog_ids`, `commenters`, `results`)
- **파일명**: `snake_case.py`

## 3. 모듈 구조

- 각 `.py` 파일 상단에 모듈 docstring 필수 (한국어, 사용 흐름 설명 포함).
- import 순서: 표준라이브러리 → 서드파티 → 프로젝트 내부 (빈 줄 구분).
- 모든 함수에 docstring (한국어) + return type hint.
- Type hints 적극 사용: `str | None` (Python 3.10+ 신문법), `list[str]`, `dict[str, int]`.

```python
"""
모듈 설명 — 한 줄 요약

상세 흐름:
  1. 단계 1
  2. 단계 2
"""
import asyncio          # 표준라이브러리

from playwright.async_api import Page  # 서드파티

from config.settings import CONSTANT  # 프로젝트 내부
from src.utils.logger import logger
```

## 4. 비동기 패턴

- Playwright 관련 함수는 모두 `async def`.
- 대기: `await asyncio.sleep(seconds)` — `time.sleep()` 사용 금지 (async 컨텍스트).
- Playwright 브라우저: `async with async_playwright() as pw:` 컨텍스트 매니저 사용.
- 딜레이는 `src/utils/delay.py` 유틸 함수 사용 (직접 sleep 금지).

## 5. 셀렉터 폴백 체인 패턴

네이버 DOM은 자주 변경되므로, 셀렉터는 반드시 **우선순위 리스트**로 관리한다.

```python
_SELECTORS = [
    ".new-editor-class",    # 신형 (1순위)
    "#legacy-id",           # 구형 (2순위)
    "[placeholder*='텍스트']",  # 범용 폴백
]

for selector in _SELECTORS:
    try:
        el = await frame.query_selector(selector)
        if el:
            return el
    except Exception:
        continue
```

- 셀렉터 변경 시 `debug_publisher.py` 또는 `debug_*.py`로 확인 후 업데이트.
- 셀렉터 리스트 상단에 주석으로 의미 표기 (어떤 에디터 버전인지).

## 6. 에러 처리 & 폴백

- 광범위한 `except Exception`으로 안정성 우선.
- **폴백 메커니즘 필수**: 우선 방법 실패 → 대체 방법.
  - 예: AI 생성 실패 → 고정 문구 (`phrases.py`)
  - 예: 관리자 URL 404 → 게시물 직접 방문
  - 예: file input 실패 → file chooser
- 재시도 횟수는 settings.py 상수로 제어 (`MAX_*_RETRIES`).
- DB 작업: `_conn()` 컨텍스트 매니저 (자동 commit/rollback/close).

## 7. 로깅

- 중앙 로거: `from src.utils.logger import logger`
- 레벨 기준:
  - `logger.info()` — 주요 상태 변화 (한글 이모티콘 포함: `▶`, `✓`)
  - `logger.debug()` — 상세 디버그 (셀렉터 매칭, 본문 길이 등)
  - `logger.warning()` — 폴백 발동, 비정상 상태
  - `logger.error()` — 치명적 오류 (`exc_info=True` 포함)
- 로그 메시지는 한국어.

## 8. 봇 감지 회피

- 타이핑: `press_sequentially(delay=80)` 또는 `keyboard.type(delay=20)` — `fill()` 사용 주의.
- 페이지 체류: `_simulate_reading()` (2~5초 대기 + 스크롤).
- 딜레이: `delay_between_comments()`, `delay_between_bloggers()` 등 유틸 사용.
- User-Agent: Windows Chrome 최신 버전.

## 9. 환경변수 & 보안

- API 키/비밀번호는 반드시 `.env`에 관리. 소스코드 하드코딩 금지.
- `.env.example`에 키 이름만 기록 (값은 비워둠).
- `.gitignore`에 `.env*`, `data/`, `logs/`, `cookies/` 포함 확인.

## 10. 검증

- 코드 변경 후 구문 검증 필수: `python -c "import py_compile; py_compile.compile('파일.py', doraise=True)"`
- 새 모듈 추가 시 import 테스트: `python -c "from src.module import function"`
- Phase 2 발행: 반드시 `--dry-run`으로 먼저 테스트.
