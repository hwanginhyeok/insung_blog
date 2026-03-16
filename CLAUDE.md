# CLAUDE.md

## Project Overview

**인성이프로젝트** — 네이버 블로그 운영 전 과정 자동화 시스템.
댓글 봇 + 게시물 자동 발행 + AI 글쓰기 스킬 개선을 단계적으로 구축한다.

### 프로젝트 목표

**1차 목표 (Phase 1~4)**: 네이버 블로그 운영 완전 자동화
- Phase 1: 댓글 봇 AI화 — **완료**
- Phase 2: 게시물 자동 발행 (사진+메모 → AI 초안 → 스마트에디터 게시) — **구현 완료, 테스트 필요**
- Phase 3: n8n + 텔레그램 연동 (모바일에서 사진 전송 → 자동 게시) — 예정
- Phase 4: 피드백 루프 (게시마다 피드백 → writing_style.md 자동 갱신) — 예정

**2차 목표 (Phase 5+)**: 수익화 & 확장
- 협찬/광고 관리 시스템 (협찬 요청 추적, 협찬 문구 자동 삽입)
- 블로그 성과 분석 (조회수, 유입 키워드, 댓글 반응률)
- 다계정 운영 지원
- 콘텐츠 캘린더 (주제 추천 + 발행 스케줄)

---

## Commands

```bash
# 가상환경 활성화
source .venv/bin/activate

# 댓글 봇 (Phase 1)
python main.py --run-once --dry-run      # 시뮬레이션
python main.py --run-once                # 즉시 1회 실행
python main.py                           # 스케줄 모드 (매일 20:30)

# 게시물 발행 (Phase 2)
python publisher_main.py --photos img1.jpg --memo "메모" --dry-run
python publisher_main.py --photos img1.jpg img2.jpg --memo "메모"
python publisher_main.py --no-ai --title "제목" --body "본문" --photos img1.jpg

# 에디터 디버그
python debug_publisher.py                # DOM 분석 + 스크린샷

# 구문 검증
python -c "import py_compile; py_compile.compile('파일.py', doraise=True)"
```

## Tech Stack

- **Python 3.12+** — async/await, type hints (Union은 `str | None` 신문법)
- **Playwright** — 브라우저 자동화 (headless/headed)
- **Claude API** — Vision(Sonnet) + Text(Haiku) 조합
- **SQLite** — 로컬 DB (data/comments.db)
- **dotenv** — 환경변수 관리

## Architecture

### 디렉토리 구조
```
인성이프로젝트/
├── main.py                   # 댓글 봇 진입점 (Phase 1)
├── publisher_main.py         # 게시물 발행 진입점 (Phase 2)
├── debug_publisher.py        # 에디터 DOM 분석 도구
├── config/
│   └── settings.py           # 모든 상수 중앙 관리
├── src/
│   ├── auth/
│   │   └── naver_login.py    # 네이버 로그인 (쿠키 복원 + ID/PW)
│   ├── ai/
│   │   └── content_generator.py  # AI 콘텐츠 생성 (Vision → 초안 → 해시태그)
│   ├── collectors/
│   │   ├── comment_collector.py  # 댓글 작성자 수집
│   │   └── post_collector.py     # 게시물 수집
│   ├── commenter/
│   │   ├── comment_writer.py     # 댓글 작성 (iframe 처리)
│   │   ├── ai_comment.py         # AI 댓글 생성 (Haiku)
│   │   └── phrases.py            # 고정 댓글 문구 (폴백)
│   ├── publisher/
│   │   └── blog_publisher.py     # 스마트에디터 자동화
│   ├── storage/
│   │   └── database.py           # SQLite 레이어 (4개 테이블)
│   └── utils/
│       ├── logger.py             # 로깅 (파일+콘솔)
│       ├── delay.py              # 봇 감지 회피 딜레이
│       ├── time_guard.py         # 허용 시간대 체크
│       └── browser.py            # Playwright 브라우저 공통 설정
├── skills/
│   └── writing_style.md      # AI 글쓰기 스타일 가이드
├── docs/                     # Phase별 설계 문서
└── data/
    └── comments.db           # SQLite DB
```

### Phase 진행 현황
| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | 댓글 봇 (AI 댓글 + 답방) | 완료 |
| 2 | 게시물 자동 발행 | 구현 완료, 테스트 필요 |
| 3 | n8n + 텔레그램 연동 | 예정 |
| 4 | 피드백 루프 (스킬 개선) | 예정 |

---

## 사고 방식: 비판적 사고 파트너

> 에이전트는 시키는 대로만 하는 실행자가 아니라, **비판적 사고 파트너**로서 행동한다.

**먼저 질문하고 논의할 것**: 새 기능 기획, 아키텍처 결정, 네이버 정책 변경 대응, 대규모 리팩토링
→ 본질 질문, 대안 제시, 숨은 비용 지적, 단순화 제안

**바로 실행해도 되는 것**: 버그 수정, 합의된 설계 구현, 단순 수정, 셀렉터 업데이트

---

## 스킬 (반복 작업 시 참조)

> 스킬은 반복적인 작업 절차를 정의한 파일. 해당 작업 수행 시 반드시 읽고 절차를 따른다.

| 파일 | 내용 | 트리거 |
|------|------|--------|
| `.claude/skills/bot-health-check.md` | 댓글 봇 상태 점검 (tmux/로그/DB/쿠키) | "봇 상태", "봇 확인", 세션 시작 시 운영 점검 |
| `.claude/skills/selector-debug.md` | 네이버 DOM 변경 대응 (디버그→분석→셀렉터 업데이트) | "셀렉터 확인", "댓글 안 달림", "DOM 분석" |
| `.claude/skills/cookie-refresh.md` | 네이버 쿠키 갱신 + Supabase 양방향 동기화 | "쿠키 갱신", "로그인 만료", 쿠키 만료 감지 시 |
| `.claude/skills/service-test.md` | 서비스 시작(tmux 4창) + 로그 모니터링 + E2E 테스트 | "서비스 시작", "테스트 준비", "워커 띄워", "E2E 테스트" |

---

## 상세 규칙 (트리거 기반 — 해당 작업 시만 Read)

> **해당 트리거에 해당하는 작업을 할 때만** 아래 매뉴얼을 읽는다.
> 관련 없는 매뉴얼은 읽지 않는다. 세션 시작 시 전부 읽지 않는다.

| 트리거 | 반드시 읽을 파일 |
|--------|-----------------|
| 코드 작성/수정 시 | `docs/프로젝트/매뉴얼/coding-rules.md` |
| 코드 완료 후 리뷰/커밋 시 | `docs/프로젝트/매뉴얼/workflow-rules.md` |
| 과거 결정/현황 확인 시 | `docs/프로젝트/TASK.md` |
| 파일 추가/삭제/이동 시 | `docs/프로젝트/CODE_MAP.md` — 갱신 필수 |

---

## Workflow 핵심

### 세션 시작 프로토콜 (필수 — 매 세션 첫 응답)

> 새 세션이 시작되면 코드 작업 전에 **반드시** 아래 순서를 실행한다.

1. **TASK 현황 점검** — `docs/프로젝트/TASK.md` 읽기 (진행 중, 지연, 우선순위 파악)
2. **브리핑 보고** — 최근 완료 요약 + 오늘 할 일 + 블로커
3. **방향성 논의** — 사용자와 우선순위 합의

> **핵심**: "켜지면 바로 코드" :x: → "켜지면 TASK 확인 → 브리핑 → 방향 합의 → 코드" :white_check_mark:

### TASK.md 실시간 갱신 (필수)

| 트리거 | 행동 |
|--------|------|
| **작업 착수 시** | "현재 진행 중"에 등록 + 상태 → `진행` |
| **작업 완료 시** | 완료 섹션으로 이동 + "현재 진행 중" 비우기 |
| **새 작업 발견 시** | 즉시 작업 현황에 등록 |
| **세션 종료 시** | 미완료 작업 진행 상황 기록 |

### 역할 구분 (가벼운 분업)

> 이름 없이, 작업 성격에 따라 모드를 전환한다.

| 역할 | 언제 | 하는 일 |
|------|------|---------|
| **코드** | 코드 작성/수정 | coding-rules.md 준수, 구문 검증 |
| **리뷰** | 코드 완료 후 | 변경 파일 리뷰, 심각도 분류, REVIEW_LOG 기록 |
| **문서** | 작업 마무리 | TASK.md 갱신, CODE_MAP 반영, 필요 시 Phase 문서 업데이트 |

### 코드리뷰 프로세스 (필수)

> 코드 수정 후 반드시 리뷰를 거쳐야 한다. 리뷰 없는 코드는 커밋하지 않는다.
> **브리핑 우선 원칙**: 이슈 발견 시 수정 전에 반드시 사용자에게 브리핑한다. 혼자 수정하지 않는다.
> 상세 프로세스: `docs/프로젝트/매뉴얼/workflow-rules.md`

1. 코드 수정 완료
2. 변경 파일 리뷰 (보안, 안정성, 컨벤션, 에러 처리)
3. **사용자 브리핑** — 이슈 목록 + 왜 문제인지 + 수정 제안
4. 사용자와 논의 → 수정 방향 합의
5. 합의된 방향으로 수정 → REVIEW_LOG.md 기록
6. 커밋

### 커밋 규칙
- 사용자가 명시적으로 요청할 때만 커밋한다
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`
- 커밋 전 구문 검증 필수 (`py_compile`)
- 커밋 전 CODE_MAP.md 반영 여부 점검

### CODE_MAP 관리
- **파일**: `docs/프로젝트/CODE_MAP.md`
- **갱신 트리거**: 파일 추가/삭제/이동/역할 변경 시 반드시 갱신
- 새 모듈, 스크립트, 문서 추가 시 해당 섹션에 한 줄 설명 추가

---

## Important Notes

- 모든 로그, 주석, 메시지는 **한국어**.
- API 키는 `.env`에만. 소스코드 하드코딩 금지.
- `.gitignore`에 `.env*`, `data/`, `logs/`, `cookies/` 포함 확인됨.
- 네이버 셀렉터는 언제든 바뀔 수 있다 — `debug_publisher.py`로 확인 후 업데이트.
