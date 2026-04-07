# 인성이프로젝트 스킬 가이드

> 프로젝트별 특수 지식 및 작업 패턴 정리

---

## 🏗️ 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 (텔레그램)                          │
└─────────────┬───────────────────────────────────────────────────┘
              │ 사진/메모/명령어
              ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│      telegram_bot.py        │    │   telegram_bot_simple.py    │
│   (사진→AI 초안 생성)        │    │   (댓글 승인 워크플로)        │
└─────────────┬───────────────┘    └─────────────┬───────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│       api_server.py         │◄───│    승인/거부/실행 큐         │
│    (FastAPI 웹훅 서버)       │    │                             │
└─────────────┬───────────────┘    └─────────────┬───────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│    src/ai/content_generator │    │   src/commenter/ai_comment  │
│    (블로그 초안 생성)         │    │   (댓글 생성 + 승인 대기)    │
└─────────────┬───────────────┘    └─────────────┬───────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│   src/publisher/blog_       │    │   src/commenter/comment_    │
│   publisher (게시물 발행)    │    │   writer (댓글 작성)        │
└─────────────────────────────┘    └─────────────────────────────┘
```

---

## 🔄 주요 워크플로우

### 1. 블로그 게시물 발행 흐름

```
사진 촬영 → 텔레그램 전송 → AI 분석 → 초안 생성 → 사용자 승인 → 네이버 발행
```

**관련 파일:**
- `telegram_bot.py` — 사진 수신 및 AI 호출
- `api_server.py` — `/generate`, `/publish` 엔드포인트
- `src/ai/content_generator.py` — AI 초안 생성
- `src/publisher/blog_publisher.py` — 스마트에디터 발행 ⚠️ (셀렉터 수정 필요)

### 2. 댓글 봇 승인 워크플로 (신규)

```
댓글 수집 → AI 생성 → DB pending → 텔레그램 알림 → 승인/거부 → 실행 큐 → 일괄 실행 → 결과 통보
```

**관련 파일:**
- `telegram_bot_simple.py` — `/pending`, `/execute` 명령어
- `src/storage/database.py` — `pending_comments`, `settings` 테이블
- `src/commenter/ai_comment.py` — AI 댓글 생성 (안전 필터 적용)

**명령어:**
| 명령어 | 설명 |
|--------|------|
| `/pending` | 승인 대기 댓글 목록 표시 |
| `✅ 승인` | 댓글을 실행 큐에 추가 |
| `❌ 거부` | 댓글 거부 (DB status 변경) |
| `/execute` | 승인된 댓글 일괄 실행 |
| `/settings` | 현재 설정 조회 |
| `/set_mode <manual/auto>` | 승인 모드 변경 |
| `/set_weekday <start> <end>` | 평일 시간대 설정 |
| `/set_weekend <start> <end>` | 주말 시간대 설정 |

---

## 🛡️ AI 안전 규칙

### 댓글 생성 시 금지 사항

| 유형 | 예시 | 처리 방식 |
|------|------|----------|
| 구체적 메뉴 언급 | "파랑버섯 수프" | ❌ 금지 — "메뉴"라고만 언급 |
| 가격 언급 | "15,000원", "2만원대" | ❌ 금지 — 가격 관련 언급 없음 |
| 특정 장소 | "강남역 3번 출구" | ❌ 금지 — 확실하지 않은 위치 정보 |
| 영업시간/주소 | "오후 3시에 갔어요" | ❌ 금지 — 추정 불가 |
| 질문 형태 | "주차 가능한가요?" | ❌ 금지 — 공감형만 사용 |

### 허용되는 표현

- ✅ "사진 보니 정말 맛있어 보이네요!"
- ✅ "분위기가 좋아 보여요~"
- ✅ "다음에 가보고 싶어요!"

---

## 📊 데이터베이스 스키마

### 승인 워크플로 테이블

```sql
-- 시스템 설정
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 기본값 설정
INSERT INTO settings VALUES 
    ('approval_mode', 'manual'),
    ('weekday_start_hour', '20'),
    ('weekday_end_hour', '24'),
    ('weekend_start_hour', '13'),
    ('weekend_end_hour', '18');

-- 승인 대기 댓글
CREATE TABLE pending_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_url TEXT NOT NULL,
    post_title TEXT,
    generated_comment TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending/posted/rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- 재시도 큐
CREATE TABLE retry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_url TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## ⚠️ 알려진 이슈

### P0 (즉시 처리 필요)

| 이슈 | 설명 | 파일 | 상태 |
|------|------|------|------|
| 스마트에디터 셀렉터 변경 | 네이버 UI 변경으로 발행 불가 | `blog_publisher.py` | 🔴 차단 |
| 승인 실행 미구현 | `/execute` 명령어 로직 필요 | `telegram_bot_simple.py` | 🚧 개발 중 |

### P1 (다음 단계)

| 이슈 | 설명 | 파일 |
|------|------|------|
| orchestrator 연동 | 수동 승인 모드 통합 | `orchestrator.py` |
| 재시도 큐 처리 | 다음날 우선 실행 | `orchestrator.py` |
| 캡차 알림 | 텔레그램 캡차 알림 | `telegram_bot.py` |

---

## 💰 비용 정보

| 서비스 | 모델 | 비용/건 | 월 예상 (50건 기준) |
|--------|------|--------|-------------------|
| AI 댓글 | Haiku | ~$0.00018 | ~$0.11 (~150원) |
| AI 블로그 | Sonnet | ~$0.01-0.03 | ~$0.5-1.5 |

---

## 📚 참조 문서

| 문서 | 설명 | 위치 |
|------|------|------|
| IMPLEMENTATION_STATUS.md | 구현 현황 — Phase별 완료도 | `docs/` |
| PRODUCTION_SPEC.md | AI 블로그 제작 스펙 | `skills/` |
| INPUT_GUIDE.md | 텔레그램 입력 가이드 | `skills/` |
| TASK.md / CURRENT_TASK.md / PREPARED_TASK.md | 작업 현황 | 프로젝트 루트 |
| CODE_MAP.md | 코드베이스 지도 | `docs/프로젝트/` |
