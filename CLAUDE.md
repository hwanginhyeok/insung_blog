# CLAUDE.md

## Project Overview

**인성이프로젝트** — 네이버 블로그 운영 전 과정 자동화 시스템.
댓글 봇 + 게시물 자동 발행 + AI 글쓰기 스킬 개선을 단계적으로 구축한다.

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | 댓글 봇 (AI 댓글 + 답방) | 완료 |
| 2 | 게시물 자동 발행 | 구현 완료, 테스트 필요 |
| 3 | n8n + 텔레그램 연동 | 80% |
| 4 | 피드백 루프 (스킬 개선) | 완료 |

---

## Commands

```bash
source .venv/bin/activate

# 댓글 봇 (Phase 1)
python main.py --run-once --dry-run      # 시뮬레이션
python main.py --run-once                # 즉시 1회 실행

# 게시물 발행 (Phase 2)
python publisher_main.py --photos img1.jpg --memo "메모" --dry-run

# 에디터 디버그
python debug_publisher.py                # DOM 분석 + 스크린샷

# 구문 검증
python -c "import py_compile; py_compile.compile('파일.py', doraise=True)"
```

## Tech Stack

- **Python 3.12+** — async/await, type hints (`str | None` 신문법)
- **Playwright** — 브라우저 자동화 (headless/headed)
- **Claude API** — Vision(Sonnet) + Text(Haiku) 조합
- **SQLite** — 로컬 DB (data/comments.db)
- **dotenv** — 환경변수 관리

---

## 세션 시작 프로토콜 (필수)

### STEP 0 — 서비스 상태 확인 + 자동 재시작 (매 세션 필수)

```bash
systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:"
```

- 3개 모두 `active (running)` → 정상, 다음 단계로
- **inactive/failed 있으면 즉시 재시작** (확인 없이 바로 실행):
  ```bash
  systemctl --user restart blog-api blog-worker blog-telegram
  sleep 2
  systemctl --user status blog-api blog-worker blog-telegram | grep -E "●|Active:"
  ```
- 재시작 후에도 failed이면 로그 확인:
  ```bash
  journalctl --user -u blog-worker -n 20 --no-pager
  ```
- 워커 중복 프로세스 체크:
  ```bash
  ps aux | grep command_worker | grep -v grep | wc -l  # 반드시 1
  ```
  2 이상이면: `systemctl --user stop blog-worker && pkill -f command_worker.py 2>/dev/null && sleep 2 && systemctl --user start blog-worker`

### STEP 1 — TASK 현황 점검

`docs/프로젝트/TASK.md` 읽기

### STEP 2 — 브리핑 보고

최근 완료 + 오늘 할 일 + 블로커

### STEP 3 — 방향성 논의

사용자와 우선순위 합의

---

## Rules (자동 로딩)

| 파일 | 내용 |
|------|------|
| `.claude/rules/coding.md` | 코딩 컨벤션 (상수, 네이밍, 비동기, 셀렉터, 에러 처리, 로깅) |
| `.claude/rules/workflow.md` | 작업 순서, 코드리뷰, 커밋 규칙, CODE_MAP 관리 |
| `.claude/rules/task-management.md` | TASK.md 갱신 규칙, 역할 전환 |
| `.claude/rules/critical-thinking.md` | 비판적 사고 파트너 원칙 |

## Skills (트리거 시 참조)

| 파일 | 트리거 |
|------|--------|
| `.claude/skills/bot-health-check.md` | "봇 상태", "봇 확인" |
| `.claude/skills/selector-debug.md` | "셀렉터 확인", "댓글 안 달림", "DOM 분석" |
| `.claude/skills/cookie-refresh.md` | "쿠키 갱신", "로그인 만료" |
| `.claude/skills/service-test.md` | "서비스 시작", "워커 띄워", "E2E 테스트" |
| `.claude/skills/telegram-bot-deploy.md` | "봇 배포", "봇 교체" |
| `.claude/skills/telegram-bot-test.md` | "텔레그램 테스트", "봇 E2E" |

---

## Important Notes

- 모든 로그, 주석, 메시지는 **한국어**.
- API 키는 `.env`에만. 소스코드 하드코딩 금지.
- 네이버 셀렉터는 언제든 바뀔 수 있다 — `debug_publisher.py`로 확인 후 업데이트.
