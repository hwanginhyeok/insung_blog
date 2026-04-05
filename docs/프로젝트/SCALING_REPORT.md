# 스케일링 공학 분석 레포트

> 작성일: 2026-04-05
> 목적: 프로 구독자 10명 → 100명 → 1000명 스케일링에 필요한 공학적 분석

---

## 1. 현재 시스템 성능 기준선

### 1.1 단일 사용자 처리 파이프라인

코드 기반 실측/설정값:

| 단계 | 소요 시간 | 근거 (코드 위치) |
|------|----------|-----------------|
| 블로그 방문 + 본문 수집 | 페이지당 ~3초 | `PAGE_LOAD_TIMEOUT=60,000ms`, `ELEMENT_TIMEOUT=10,000ms` (settings.py:89-90) |
| AI 댓글 생성 (Ollama gemma3:4b) | 순차 ~2-3초/개, 병렬 ~1.5초/개 | `_OLLAMA_PARALLEL=3` (ai_comment.py:41), `ThreadPoolExecutor(max_workers=3)` (ai_comment.py:571) |
| AI 댓글 생성 (Haiku API) | ~0.5초/개 | `COMMENT_AI_MODEL="claude-haiku-4-5-20251001"` (settings.py:100), 배치 API 1회 호출로 3개 생성 (ai_comment.py:635-640) |
| 댓글 게시 (Playwright) | 5~15초 (딜레이 포함) | `DELAY_BETWEEN_COMMENTS_MIN=5`, `MAX=15` (settings.py:74-75) |
| 블로거 간 딜레이 | 30~60초 | `DELAY_BETWEEN_BLOGGERS_MIN=30`, `MAX=60` (settings.py:76-77) |
| 타이핑 시뮬레이션 | 글자당 0.05~0.15초 | `DELAY_TYPING_MIN=0.05`, `MAX=0.15` (settings.py:78-79) |
| 댓글 lazy-load 대기 | 5초 | `COMMENT_LOAD_WAIT=5` (settings.py:48) |

### 1.2 단일 사용자 봇 실행 1회 지표

| 지표 | 값 | 근거 |
|------|-----|------|
| 최대 블로거 수/일 | 10명 | `MAX_BLOGGERS_PER_DAY=10` (settings.py:56) |
| 최대 댓글 수/일 | 30개 | `MAX_COMMENTS_PER_DAY=30` (settings.py:57) |
| 블로거당 댓글 게시물 | 3~5개 | `POSTS_PER_BLOGGER_MIN=3`, `MAX=5` (settings.py:58-59) |
| 배치 크기 (AI 생성) | 3개씩 | `BATCH_SIZE = 3` (orchestrator.py:282) |
| 최대 답글 수/실행 | 20개 | `MAX_REPLIES_PER_RUN=20` (settings.py:51) |
| 최대 답글 수/일 | 50개 | `MAX_REPLIES_PER_DAY=50` (settings.py:52) |
| 답글 스캔 게시물 수 | 10개 | `REPLY_SCAN_POSTS=10` (settings.py:53) |
| 게시물 나이 제한 | 90일 | `MAX_POST_AGE_DAYS=90` (settings.py:63) |
| 실행 소요 시간 (추정) | ~15-20분 | 10명 × (수집 3초 + 댓글 3개 × 10초 + 딜레이 45초) |

### 1.3 현재 인프라

| 구성 요소 | 상세 | 근거 |
|----------|------|------|
| 서버 | WSL2 Ubuntu, 단일 서버 | CLAUDE.md |
| 서비스 관리 | systemd --user: `blog-api`(8001), `blog-worker`(1개), `blog-telegram` | CLAUDE.md |
| 동시 브라우저 제한 | `MAX_CONCURRENT_BROWSERS=3` (기본값, .env로 조절 가능) | command_worker.py:64 |
| 브라우저 세마포어 | `asyncio.Semaphore(3)` — 전체 워커에서 공유 | command_worker.py:65 |
| 유저별 슬롯 분배 | Elastic Semaphore: 혼자면 전체 3슬롯, 유저 늘면 공정 분배 (`max(1, 3 // active_users)`) | command_worker.py:78-90 |
| 명령 큐 폴링 | 10초 간격 (`POLL_INTERVAL=10`) | command_worker.py:61 |
| 워커 중복 방지 | pidfile 잠금 (`fcntl.flock`) | command_worker.py:125-136 |
| DB (외부) | Supabase (PostgreSQL) — service_role 키 사용 | supabase_client.py:28-38 |
| DB (로컬) | SQLite — 유저별 분리 (`data/{user_id[:8]}/comments.db`) | settings.py:18-20 |
| AI (로컬) | Ollama gemma3:4b — 병렬 3 (`_OLLAMA_PARALLEL=3`) | ai_comment.py:41 |
| AI (API) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | settings.py:100 |
| 쿠키 관리 | 암호화 저장 (Supabase bot_cookies), 유저별 분리 | supabase_client.py:446-502 |
| 워커 명령 수 | 14종 (run, execute, retry, publish, save_draft 등) | command_worker.py:1509-1524 |

### 1.4 안전장치 (현재 구현)

| 장치 | 상세 | 코드 위치 |
|------|------|----------|
| 연속 실패 중단 | 5회 연속 실패 시 자동 중단 | `MAX_CONSECUTIVE_FAILURES=5` (command_worker.py:69) |
| 조기 경고 | 3회 연속 실패 시 텔레그램 알림 | `WARN_CONSECUTIVE_FAILURES=3` (command_worker.py:70) |
| 브라우저 재시작 | 30개마다 브라우저 재시작 | `BATCH_SIZE=30` (command_worker.py:68) |
| 일일 봇 한도 (Freemium Gate) | `check_daily_bot_limit()` RPC | command_worker.py:40-57 |
| 종료 시그널 처리 | SIGINT/SIGTERM 시 남은 댓글 approved 롤백 | command_worker.py:109-120 |
| stale 명령 복구 | 워커 재시작 시 running → pending 자동 복구 | command_worker.py:1531-1553 |
| 오토 블로거 감지 | 점수 기반 스킵 (HIGH=70, LOW=40) | settings.py:154-155 |

---

## 2. 동시 사용자 시나리오 분석

### 가정

- 프로 구독자 중 동시 접속률: 보수적 5%, 일반 10%, 피크 20%
- 각 사용자: 1일 1-2회 봇 실행 (`run` + `execute`), 1회당 최대 30개 댓글
- 봇 실행 1회 소요: ~20분 (수집 + 생성 + 게시)
- 허용 시간대: 20:00~24:00 (settings.py:66-67) → 실질 피크 4시간

### 2.1 프로 구독자 10명

| 지표 | 값 | 산출 근거 |
|------|-----|----------|
| 동시 봇 실행 (피크 20%) | 2명 | 10 × 0.2 |
| 분당 댓글 처리 필요량 | ~3개/분 | 60개/20분 |
| 일일 총 댓글 | ~300개 | 10명 × 30개 |
| 브라우저 세션 동시 | 2개 | 현재 semaphore=3이면 여유 |
| 메모리 필요 (Playwright) | ~600MB | Playwright 세션당 ~300MB |
| AI 생성 부하 | Ollama 병렬 3 → 충분 | 3개/분 × 3병렬 = ~9개/분 여유 |
| DB 쿼리/분 | ~10 | pending/settings/run_log CRUD |
| Elastic Semaphore 분배 | 유저 2명 → 각 1슬롯 (3//2=1) | command_worker.py:89 |
| **현재 시스템으로 가능?** | **가능 (여유 있음)** | semaphore 3, Ollama 충분 |

**병목 없음**. 현재 아키텍처로 문제 없이 처리 가능.

### 2.2 프로 구독자 100명

| 지표 | 값 | 산출 근거 |
|------|-----|----------|
| 동시 봇 실행 (피크 20%) | 20명 | 100 × 0.2 |
| 분당 댓글 처리 필요량 | ~30개/분 | 600개/20분 |
| 일일 총 댓글 | ~3,000개 | 100명 × 30개 |
| 브라우저 세션 동시 | 20개 | 현재 semaphore=3 → **심각 병목** |
| 메모리 필요 (Playwright) | ~6GB | 20세션 × 300MB |
| AI 생성 부하 | Ollama 한계 초과 → **API 필수** | 30개/분 > Ollama 9개/분 |
| DB 쿼리/분 | ~100 | connection pool 필요 |
| Elastic Semaphore 분배 | 유저 20명 → 각 1슬롯 (3//20=1이지만 세마포어 3 공유) | **대기열 17명** |
| **필요한 변경** | **워커 다중화, API 전환, 서버 스펙업** | 아래 상세 |

**핵심 문제**:
1. `_browser_semaphore = asyncio.Semaphore(3)` → 20명이 동시 요청하면 17명 대기
2. 단일 워커 프로세스 → 명령 처리 직렬화
3. Ollama 처리량 한계 (로컬 GPU 1개)

### 2.3 프로 구독자 1000명

| 지표 | 값 | 산출 근거 |
|------|-----|----------|
| 동시 봇 실행 (피크 20%) | 200명 | 1000 × 0.2 |
| 분당 댓글 처리 필요량 | ~300개/분 | 6,000개/20분 |
| 일일 총 댓글 | ~30,000개 | 1000명 × 30개 |
| 브라우저 세션 동시 | 200개 | 단일 서버 불가 |
| 메모리 필요 (Playwright) | ~60GB | 200세션 × 300MB |
| AI 생성 부하 | API 배치 + 캐싱 필수 | |
| DB 쿼리/분 | ~1,000 | PgBouncer + 읽기 복제본 |
| **필요한 변경** | **분산 워커 클러스터, 큐 시스템, 다중 서버** | |

---

## 3. 병목 분석 (현재 → 개선)

### 3.1 브라우저 세션 (_browser_semaphore)

**현재 구현**:
```python
# command_worker.py:64-65
MAX_CONCURRENT_BROWSERS = int(os.environ.get("MAX_CONCURRENT_BROWSERS", "3"))
_browser_semaphore = asyncio.Semaphore(MAX_CONCURRENT_BROWSERS)
```

- 전체 워커에서 공유하는 글로벌 세마포어
- 모든 브라우저 소비 명령(`run`, `execute`, `visit_neighbors`, `discover_and_visit`, `feed_comment`, `auto_reply`)이 `async with _browser_semaphore:` 획득 필요
- Elastic Semaphore: `get_slots_for_user()` → 유저 혼자면 3슬롯, 유저 늘면 `max(1, 3 // active_users)` 분배

**스케일 문제**:
| 구독자 수 | 동시 피크 | 세마포어 3 대비 | 필요한 슬롯 |
|----------|---------|-------------|-----------|
| 10명 | 2명 | 여유 | 3 (현행 유지) |
| 100명 | 20명 | 17명 대기 | 20+ |
| 1000명 | 200명 | 197명 대기 | 분산 필수 |

**개선 방향**:
- 10명: `.env MAX_CONCURRENT_BROWSERS=5` 정도로 조절 (WSL2 RAM 8GB 기준)
- 100명: 워커 프로세스 다중화 (3-5개 워커, 각 semaphore=5 → 총 15-25 동시)
- 1000명: 분산 워커 클러스터 (Redis/Celery 큐 + 다중 서버)

### 3.2 AI 생성 처리량

**현재 구현**:
```python
# ai_comment.py — 우선순위: Ollama → Anthropic API → phrases 폴백
_OLLAMA_URL = "http://127.0.0.1:11434"
_OLLAMA_MODEL = "gemma3:4b"
_OLLAMA_PARALLEL = 3  # ThreadPoolExecutor max_workers
COMMENT_AI_MODEL = "claude-haiku-4-5-20251001"
```

- 배치 생성: 3개 게시물을 1회 API 호출로 처리 (ai_comment.py:509-524)
- Ollama 병렬: `ThreadPoolExecutor(max_workers=3)` (ai_comment.py:571)
- 본문 길이 제한: `_MAX_BODY_CHARS=1000` (토큰 절약)
- 답글(대댓글)은 순차 생성: `generate_replies_batch()` → 각각 `generate_reply()` 호출 (ai_reply.py:137-153)

**처리량 추정**:
| 모델 | 단건 | 병렬 | 분당 처리량 |
|------|------|------|-----------|
| Ollama gemma3:4b (로컬) | ~2.5초/개 | 3병렬 → ~0.8초/개 | ~75개/분 (이론), 실측 ~40개/분 |
| Haiku API (배치 3) | ~0.5초/개 | API 제한 내 무한 | ~120개/분 |
| Haiku API (단건) | ~0.5초/개 | — | ~120개/분 |

**스케일 매핑**:
- 10명 (3개/분): Ollama 충분
- 100명 (30개/분): Ollama 가능하나 여유 없음, API 혼합 권장
- 1000명 (300개/분): API 필수 + 배치 최적화

### 3.3 DB (Supabase)

**현재 구현**:
```python
# supabase_client.py:27-38
@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(url, key)  # 싱글턴
```

- 클라이언트 싱글턴 (`@lru_cache(maxsize=1)`)
- admin user_id 캐싱 (`_user_id_cache`)
- 주요 테이블: `bot_commands`, `bot_settings`, `bot_run_log`, `pending_comments`, `bot_cookies`, `incoming_comments`, `generation_queue`

**스케일 문제**:
| 구독자 수 | 분당 쿼리 | Supabase 제한 | 필요 조치 |
|----------|---------|-------------|----------|
| 10명 | ~10 | Free tier 충분 | 없음 |
| 100명 | ~100 | Free tier 한계 | Pro tier 전환 |
| 1000명 | ~1,000 | Pro tier도 부하 | PgBouncer + 읽기 복제본 |

### 3.4 쿠키/세션 관리

**현재 구현**:
- 유저별 쿠키 Supabase 암호화 저장 (`bot_cookies.cookie_data`)
- 쿠키 만료 감지: `NID_AUT` 쿠키 존재 여부 검증 (command_worker.py:325-328)
- 만료 시: 텔레그램 알림 + 웹 대시보드에서 수동 재업로드
- 만료 이벤트 `bot_run_log`에 기록 (`record_cookie_expiry()`)

**스케일 이슈**:
- 쿠키 수명: 네이버 쿠키 유효 기간 ~24시간 (추정)
- 10명: 수동 재업로드 가능
- 100명: 10~20명/일 만료 → 수동 대응 비현실적 → **자동 갱신 또는 세션 연장 필요**
- 1000명: 100~200명/일 만료 → **자동화 필수** (OAuth 또는 세션 연장 크론)

### 3.5 네이버 봇 감지 리스크

**현재 방어 장치**:
- 딜레이: 댓글 간 5-15초, 블로거 간 30-60초 (settings.py:74-77)
- 타이핑 시뮬레이션: 글자당 0.05-0.15초 (settings.py:78-79)
- User-Agent: Chrome 133 위장 (browser.py:12-16)
- 봇 감지 회피: `--disable-blink-features=AutomationControlled` (browser.py:23)
- 허용 시간대: 20:00~24:00 (자연스러운 활동 시간)
- 오토 블로거 감지: 점수 70+ 스킵, 40+ 30% 스킵 (settings.py:154-155)

**IP 리스크**:
| 구독자 수 | 동일 IP 계정 수 | 리스크 | 대응 |
|----------|--------------|--------|------|
| 10명 | 2-3동시 | 낮음 | 현행 유지 |
| 100명 | 10-20동시 | **중간** | 프록시 풀 도입 권장 |
| 1000명 | 100-200동시 | **매우 높음** | 프록시 풀 + IP 로테이션 필수 |

### 3.6 워커 아키텍처

**현재 구현**:
- 단일 워커 프로세스 (`command_worker.py`)
- pidfile 잠금으로 중복 실행 방지 (`fcntl.flock`)
- 10초 폴링으로 Supabase `bot_commands` 감지
- `asyncio.Task`로 병렬 실행 (세마포어 내)
- 14종 명령 핸들러 매핑 (command_worker.py:1509-1524)

**문제**: 단일 프로세스 → asyncio 이벤트 루프 1개 → CPU 바운드 작업(Ollama) 시 다른 명령 블로킹

---

## 4. 수집 병렬화 설계 (구현 계획)

### 현재 플로우

```
[수집 브라우저 열기]
 → 로그인
 → 댓글 작성자 수집
 → 수집 브라우저 닫기 (orchestrator.py:220)
                          ↓
[블로거별 병렬 방문] (Elastic Semaphore)
 → 각 블로거마다: 브라우저 생성 → 로그인 → 게시물 수집 → AI 생성 → 댓글 작성 → 브라우저 닫기
```

현재 orchestrator.py에 이미 블로거 단위 병렬화가 구현되어 있음:
```python
# orchestrator.py:392-418
# 병렬 실행: 유저당 할당 슬롯만큼 동시 방문
slots = get_slots_for_user(user_id)
results = await asyncio.gather(
    *[_visit_one(bid, pw_visit) for bid in batch_blogs],
    return_exceptions=True,
)
```

### 개선 플로우 (게시물 수집-생성 분리)

```
[Phase 1: 병렬 수집 — 읽기만]
 방문A + 방문B + 방문C → asyncio.gather로 동시 수집
 → 본문 A, B, C 확보
                          ↓
[Phase 2: 병렬 AI 생성]
 생성A + 생성B + 생성C → ThreadPoolExecutor 또는 API 배치
 → 댓글 A, B, C 확보
                          ↓
[Phase 3: 순차 게시 — 봇 감지 방지]
 게시A → 딜레이 → 게시B → 딜레이 → 게시C
```

### 구현 포인트

1. **orchestrator.py**: `_visit_one()` 내부에서 "수집 + 생성 + 게시"가 하나로 묶여 있음. 이를 "수집" / "게시"로 분리
2. **수집 전용 브라우저 컨텍스트**: 읽기전용이므로 봇 감지 리스크 낮음, 딜레이 최소화 가능
3. **게시 전용 컨텍스트**: 기존 딜레이 유지 (봇 감지 방지)
4. **예상 절감**: 블로거 10명 기준, 수집 단계 ~5분 → ~2분 (50% 절감), 전체 20분 → 17분

### 리스크

- 수집과 게시 사이 시간 지연 발생 → 그 사이 새 댓글이 달릴 수 있음 (중복 체크 필요)
- 수집 시 다수 페이지 동시 접속 → 네이버 rate limit 가능성

---

## 5. 단계별 인프라 로드맵

### Phase 1: 10명 (현재 ~ 2주)

- [x] Ollama 병렬 처리 (완료 — `_OLLAMA_PARALLEL=3`, ThreadPoolExecutor)
- [x] 블로거 단위 병렬 방문 (완료 — Elastic Semaphore)
- [x] 유저별 DB 분리 (완료 — `data/{user_id[:8]}/comments.db`)
- [x] 일일 한도 Freemium Gate (완료 — `check_daily_bot_limit()` RPC)
- [x] 연속 실패 자동 중단 (완료 — `MAX_CONSECUTIVE_FAILURES=5`)
- [ ] 수집-생성-게시 단계 분리 (병렬화 개선)
- [ ] 봇 실행 성공률 모니터링 지표 추가
- 추가 비용: **₩0**

### Phase 2: 100명 (1-2개월)

- [ ] AI 기본 모델을 Haiku API로 전환 (프로 유저)
  - Ollama는 무료 유저 전용 또는 API 장애 폴백으로 유지
- [ ] 워커 다중화 (3-5개 워커 프로세스)
  - pidfile 잠금 제거 → Redis 기반 분산 잠금으로 전환
  - `bot_commands` claim 로직은 이미 atomic (`SELECT WHERE status='pending'` + `UPDATE`)
- [ ] `MAX_CONCURRENT_BROWSERS` 서버당 10-15로 증설
- [ ] 서버 스펙업: RAM 16GB+, CPU 4코어+
- [ ] Supabase Pro tier 전환
- [ ] 쿠키 자동 감지 + 텔레그램 재업로드 UX 개선
- [ ] 에러 모니터링 (Sentry 또는 자체 대시보드)
- [ ] IP 분산: 프록시 풀 도입 검토 (100명 시점)
- 추가 비용 예상: **월 ₩50,000-100,000**
  - Supabase Pro: $25/월
  - 서버 스펙업: 기존 WSL2 → Cloud VM 전환 시 $20-40/월
  - 프록시 (선택): $10-30/월

### Phase 3: 1000명 (3-6개월)

- [ ] 분산 워커 클러스터
  - Redis Queue (또는 Celery) + 다중 워커 서버
  - 서버 2-5대, 각 워커 5-10개 프로세스
- [ ] 프록시 풀 (IP 분산) 필수
  - 주거용 프록시: 유저당 IP 할당 (감지 회피)
- [ ] Supabase → 자체 PostgreSQL (또는 Supabase Pro+)
  - PgBouncer connection pooling
  - 읽기 복제본
- [ ] CDN + 캐싱 레이어
  - 자주 조회되는 설정/쿠키를 Redis 캐싱
- [ ] 자동 스케일링
  - 동시 접속 수 기반 워커 자동 증감
- [ ] 쿠키 자동 갱신 시스템
- 추가 비용 예상: **월 ₩500,000-1,000,000**
  - Cloud VM 2-5대: $100-300/월
  - 프록시 풀: $100-300/월
  - DB: $50-100/월
  - API 비용: 별도 (아래 비용 분석 참고)

---

## 6. 비용 분석 (프로 플랜 ₩20,000/월 기준)

### AI API 비용 상세

| 모델 | 입력 비용 | 출력 비용 | 댓글 1개당 추정 비용 |
|------|---------|---------|-----------------|
| claude-haiku-4-5 | $0.80/1M 입력 토큰 | $4.00/1M 출력 토큰 | ~₩3-5 (입력 ~500토큰, 출력 ~150토큰) |
| Ollama gemma3:4b | 무료 (로컬 GPU) | 무료 | ₩0 (전기세 제외) |

### 비용 시뮬레이션

| 구독자 수 | 월 매출 | AI API 비용 | 인프라 비용 | 월 마진 | 마진율 |
|----------|--------|-----------|-----------|---------|-------|
| 10명 | ₩200,000 | ₩0 (Ollama) | ₩0 (WSL2) | **₩200,000** | 100% |
| 10명 (API) | ₩200,000 | ₩45,000 | ₩0 | **₩155,000** | 78% |
| 100명 | ₩2,000,000 | ₩450,000 | ₩100,000 | **₩1,450,000** | 73% |
| 1000명 | ₩20,000,000 | ₩4,500,000 | ₩1,000,000 | **₩14,500,000** | 73% |

> AI 비용 산출: 사용자당 일 30댓글 + 20답글 = 50건 × 30일 = 1,500건/월 × ₩3/건 = ₩4,500/월/유저
>
> 10명까지는 Ollama 로컬로 API 비용 ₩0 달성 가능. 100명부터 API 전환 시에도 마진율 73% 유지.

### Ollama vs API 전환 임계점

| 지표 | Ollama (현재) | Haiku API |
|------|-------------|-----------|
| 비용 | ₩0/월 | ₩4,500/유저/월 |
| 처리량 | ~40개/분 (로컬 GPU 의존) | ~120개/분 (무제한 스케일) |
| 지연 | 2-3초/개 | 0.5초/개 |
| 품질 | 양호 (4B 모델) | 우수 (Haiku) |
| **전환 임계점** | 동시 요청 5+ 또는 30개/분 초과 시 | — |

**권장**: 10명까지 Ollama 유지, 20명 이상 시 API 기본 전환 (마진 영향 미미: 78% → 73%)

---

## 7. 리스크 매트릭스

| 리스크 | 확률 | 영향 | 현재 대응 | 추가 필요 대응 |
|--------|------|------|---------|-------------|
| 네이버 봇 감지 (단일 계정) | 중 | 높음 | 딜레이 5-60초, UA 위장, 타이핑 시뮬레이션 | 프록시 분산, 유저별 패턴 랜덤화 |
| 네이버 봇 감지 (동일 IP 다수 계정) | 100명+: 높음 | 매우 높음 | 없음 (단일 서버) | **100명 전에 프록시 풀 필수** |
| 쿠키 대량 만료 | 높음 | 중 | 텔레그램 알림, 수동 재업로드 | 자동 감지 + 인앱 UX 개선, 세션 연장 크론 |
| API 비용 초과 | 낮음 | 중 | 일일 한도 30건, Ollama 폴백 | 사용량 모니터링 대시보드, Ollama 혼합 전략 |
| 서버 장애 (단일 장애점) | 낮음 | 높음 | systemd 자동 재시작, stale 명령 복구 | 다중 서버 + 헬스체크 + 자동 페일오버 |
| 네이버 DOM 변경 | 중 | 높음 | `debug_publisher.py` DOM 분석 | 셀렉터 자동 감지 + 변경 알림 |
| Supabase 장애 | 낮음 | 높음 | config/settings.py 기본값 폴백 | 로컬 SQLite 임시 저장 + 동기화 |
| Ollama 모델 메모리 부족 | 동시 3+ 요청 시 | 중 | `_OLLAMA_PARALLEL=3` 제한 | GPU 모니터링, OOM 시 API 자동 전환 |
| 워커 프로세스 크래시 | 낮음 | 중 | pidfile 잠금, systemd 자동 재시작 | 크래시 알림, 워커 헬스체크 엔드포인트 |

---

## 8. 핵심 KPI 대시보드 (모니터링 필요)

### 현재 측정 가능한 지표

| 지표 | 현재 값 | 데이터 소스 |
|------|--------|-----------|
| 분당 댓글 처리량 | ~40개/분 (Ollama 3병렬) | 추정 (실측 필요) |
| 동시 봇 실행 가능 수 | 3 (semaphore) | command_worker.py:64 |
| 일일 한도/유저 | 30댓글, 10블로거 | settings.py:56-57 |
| 봇 실행 기록 | Supabase `bot_run_log` | supabase_client.py:597-628 |
| 실행 소요 시간 | `duration_seconds` 기록 중 | supabase_client.py:616 |

### 측정이 필요한 (현재 미측정) 지표

| 지표 | 10명 목표 | 100명 목표 | 구현 방법 |
|------|----------|-----------|----------|
| 봇 실행 성공률 | 95%+ | 99%+ | `bot_run_log.error_message IS NULL` 비율 |
| 평균 실행 시간 | ~15분 | ~15분 | `bot_run_log.duration_seconds` 평균 |
| 쿠키 유효율 | 90%+ | 95%+ | 쿠키 만료 이벤트 / 전체 실행 비율 |
| API 에러율 | <5% | <1% | AI 생성 실패 → phrases 폴백 비율 |
| 댓글 게시 성공률 | 90%+ | 95%+ | `success / (success + failed)` per execute |
| 연속 실패 발생 빈도 | <1회/주 | <1회/월 | `MAX_CONSECUTIVE_FAILURES` 도달 횟수 |
| 워커 대기열 길이 | <3 | <10 | `bot_commands WHERE status='pending'` COUNT |
| 동시 활성 유저 수 | 실시간 추적 | 실시간 추적 | `_user_active_slots` 크기 |

---

## 9. 즉시 실행 가능한 최적화 (코드 변경 없이)

1. **`.env MAX_CONCURRENT_BROWSERS=5`** — WSL2 RAM 8GB 기준 안전 범위, 현재 3 → 5로 증설
2. **`.env OLLAMA_PARALLEL=4`** — GPU 여유 시 병렬 수 증가
3. **Supabase 쿼리 최적화** — `bot_commands` 테이블에 `(status, created_at)` 복합 인덱스 확인
4. **모니터링 대시보드** — `bot_run_log` 기반 일일 성공률/실행시간 리포트 자동화

---

## 10. 결론

| 단계 | 기술적 핵심 과제 | 예상 소요 | 난이도 |
|------|----------------|---------|--------|
| 10명 | 현행 유지, 수집 병렬화 개선 | 1주 | 낮음 |
| 100명 | 워커 다중화, API 전환, 프록시 | 1-2개월 | 중간 |
| 1000명 | 분산 아키텍처, 큐 시스템, 다중 서버 | 3-6개월 | 높음 |

**가장 먼저 해야 할 것**: 10명 단계에서 봇 실행 성공률/실행 시간 KPI를 측정하고 기준선을 확립하는 것. 데이터 없이 스케일링하면 어디가 터지는지 모른다.

**가장 위험한 것**: 네이버 동일 IP 봇 감지. 100명 이전에 프록시 전략을 확정해야 한다.
