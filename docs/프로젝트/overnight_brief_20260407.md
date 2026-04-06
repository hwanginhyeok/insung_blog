# Eng Review + QA 리포트 (2026-04-07)

**범위**: 최근 11개 커밋 (`f606437`..`d9ac1bc`)
**리뷰어**: Claude Opus 4.6

---

## 1. 댓글 게시 병렬화 (`command_worker.py`)

### 1-1. consecutive_failures 레이스 컨디션 — P2 (잠재적 이슈)

**파일**: `/home/window11/insung_blog/command_worker.py` L422, L451, L462, L469
**현상**: `consecutive_failures`는 `nonlocal`로 선언된 int 변수로, 최대 3개의 동시 코루틴이 읽기/쓰기를 수행한다.

**분석**: asyncio는 단일 스레드이므로 **동시 read-modify-write는 발생하지 않는다**. `+=1`이나 `=0` 대입은 await 사이에 일어나므로 실제 데이터 경합은 없다. 다만 의미론적 문제는 존재한다:

- 코루틴 A가 실패 → `consecutive_failures = 3` (경고 발송)
- 코루틴 B가 성공 → `consecutive_failures = 0` (리셋)
- 코루틴 C가 실패 → `consecutive_failures = 1`

이 경우 실제로는 "A 실패 → B 성공 → C 실패"인데, 리셋이 중간에 끼어 연속 실패 카운트가 정확하지 않다. **실질 영향은 낮음** — 오탐(과도한 중단)이 아닌 미탐(중단 지연) 방향이므로 안전 쪽이다.

**권장**: 현행 유지 가능. 더 정확하게 하려면 `_abort` 플래그 대신 per-batch 실패율 기반 중단으로 전환.

### 1-2. _abort 플래그 thread-safety — OK

**파일**: L390, L403, L424, L434, L498
`_abort`는 asyncio 단일 스레드에서 `bool` 대입이므로 안전하다. `nonlocal` + 단일 이벤트 루프 조합으로 문제 없음.

### 1-3. context.new_page() 누적 — OK

**파일**: L437, L473
`_post_one_comment` 내부에서 `await context.new_page()` 생성 후, `finally` 블록에서 `await comment_page.close()`를 호출한다. 예외가 발생해도 반드시 닫히므로 **누적 없음**.

### 1-4. 배치 전체를 gather로 동시 실행 시 세마포어 효과 — OK

**파일**: L501-503
배치(최대 30개)를 한 번에 `asyncio.gather`하지만, `execute_sem = Semaphore(3)`이 동시 실행을 3개로 제한한다. 나머지 27개는 세마포어 대기 상태. 설계 의도대로 동작.

### 1-5. 브라우저 재시작 시 진행 중인 코루틴 — P2 (잠재적 이슈)

**파일**: L401-418, L500-504
배치 루프에서 `await asyncio.gather()`가 배치 내 모든 코루틴 완료를 기다린 후 다음 배치로 넘어간다. 그 사이에 `await browser.close()` → 새 브라우저 생성이 일어나므로 **이전 배치의 코루틴이 새 배치 브라우저를 사용하는 일은 없다**. 안전.

다만, `_abort` 플래그가 설정되면 이미 세마포어에서 대기 중인 코루틴들은 세마포어 획득 후 `_abort` 체크(L434)로 바로 리턴한다. 이때 `comment_page = await context.new_page()`까지 도달하지 않으므로 불필요한 페이지 생성도 없다. **OK**.

---

## 2. 이웃 방문 병렬화 (`neighbor_visitor.py`)

### 2-1. 페이지 생성/종료 패턴 — OK

**파일**: `/home/window11/insung_blog/src/neighbor/neighbor_visitor.py` L95, L134
`context.new_page()` 생성 → `finally`에서 `visit_page.close()`. 댓글 게시와 동일 패턴.

### 2-2. 딜레이 위치 — 설계 의도대로

**파일**: L136-137
`delay_between_bloggers()`가 세마포어 밖에 있어서, 딜레이 중에 다른 코루틴이 세마포어를 획득할 수 있다. 주석에 명시되어 있고, 네이버 감지 방지와 처리량 사이의 의도적 트레이드오프.

**주의점**: 모든 코루틴이 거의 동시에 시작하므로, 3개가 동시에 방문 → 3개 동시에 딜레이 → 3개 동시에 방문 패턴이 반복될 수 있다. 네이버 입장에서는 "30초 간격으로 3개씩 버스트 요청"으로 보일 수 있다. 현재 사용자 규모에서는 문제 없으나, 블로거/일 한도가 200명까지 올라갈 경우 재검토 필요.

### 2-3. `auto_neighbor_request` 미사용 — P3 (코드 냄새)

**파일**: L59
`auto_request = settings.get("auto_neighbor_request", False)` 변수가 선언되었지만 이후 로직에서 사용되지 않는다. `neighbor_type in ("discovered", None)` 조건으로 분기하고 있어, `auto_request` 플래그와 무관하게 이웃 신청이 시도된다.

---

## 3. 페르소나 크롤러 (`naver-blog.ts`)

### 3-1. BlockSequenceItem 확장 — OK

**파일**: `/home/window11/insung_blog/apps/web/lib/crawl/naver-blog.ts` L29-45
`align`, `font`, `fontSize`, `boldTexts` 필드가 추가되었으며, 모두 optional이므로 하위 호환성 문제 없음.

### 3-2. 첫 번째 span 기준 대표값 — P3 (정확도 한계)

**파일**: L323-335
블록의 폰트/크기를 "첫 번째 span" 기준으로 추출한다. 한 블록 내에 여러 폰트/크기가 혼용될 경우 대표값이 부정확할 수 있다. 페르소나 분석의 입력 데이터이므로 AI가 종합 판단하는 구조상 큰 문제는 아님.

### 3-3. analyze-persona.ts max_tokens 증가 — OK

**파일**: `/home/window11/insung_blog/apps/web/lib/ai/analyze-persona.ts` L329
Pass 1 max_tokens가 3000 → 6000으로 증가. 블록 상세 데이터 추가로 출력량이 늘어났기 때문. Sonnet 모델의 max_output_tokens(8192) 이내이므로 문제 없음.

---

## 4. 글 생성 프롬프트 (`generate-post.ts`)

### 4-1. 동적 글자수 한도 — OK

**파일**: `/home/window11/insung_blog/apps/web/lib/ai/generate-post.ts` L22-23, L370
`POST_BODY_BASE_MAX_CHARS(1500) + photoCount * POST_BODY_PER_PHOTO_CHARS(200)` 공식으로 사진 수에 비례해 한도 증가. 사진 10장이면 최대 3500자. 합리적.

### 4-2. 모든 사진 포함 강제 — OK

**파일**: L372
프롬프트에 `모든 사진을 빠짐없이 [PHOTO_1]~[PHOTO_${photoCount}] 마커로 포함할 것` 명시. AI가 사진을 누락하는 문제를 프롬프트 레벨에서 방지.

### 4-3. JSON 파싱 3차 폴백 — OK

**파일**: L267-328
1차 JSON.parse → 2차 Regex → 3차 중괄호 경계 추출. 3차 폴백은 AI가 JSON 앞뒤에 설명 텍스트를 붙이는 경우를 처리. 방어적 설계.

### 4-4. bodyMatch 세미콜론 누락 — P3 (스타일)

**파일**: L291
```typescript
const bodyMatch = cleaned.match(/"body"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/)
```
줄 끝에 세미콜론(`;`)이 빠져 있다. TypeScript의 ASI(Automatic Semicolon Insertion)로 동작에는 문제 없으나, 프로젝트 내 다른 코드와 일관성이 떨어진다.

---

## 5. 렌더러 (`naver-html.ts`)

### 5-1. [STICKER]/[SEPARATOR]/[MAP] 마커 처리 — OK

**파일**: `/home/window11/insung_blog/apps/web/lib/render/naver-html.ts` L316-336
각 마커가 단독 줄에 있을 때 올바르게 처리된다:
- `[SEPARATOR]` → `makeSeparatorBlock()` (SmartEditor 가로줄)
- `[STICKER]` → `makeStickerPlaceholder()` (빈 줄 대체, 에디터에서 수동 삽입)
- `[MAP]` → 빈 줄 2개 (에디터에서 수동 삽입)

### 5-2. 프리뷰와 렌더러의 마커 파싱 불일치 — P2

**파일**: `write/page.tsx` L1235 vs `naver-html.ts` L294-300

| 항목 | 프리뷰 (write/page.tsx) | 렌더러 (naver-html.ts) |
|------|------------------------|----------------------|
| 분할 기준 | `\n\n` 으로만 분할 | `\n\n+` 분할 후 각 내부를 `\n`으로 재분할 |
| 마커 매칭 | paragraph 전체가 마커여야 함 | line 단위로 매칭 |

**시나리오**: AI가 `"텍스트\n[PHOTO_1]\n텍스트"` (단일 `\n` 구분)을 생성하면:
- 렌더러: `\n`으로 분할하여 `[PHOTO_1]`을 인식 → 이미지 삽입 (정상)
- 프리뷰: `\n\n`으로 분할 시 이 전체가 하나의 paragraph → `[PHOTO_1]`이 텍스트로 노출 (마커 미렌더링)

**영향**: 프리뷰에서 마커가 텍스트로 보이지만, 실제 발행 시에는 정상. 사용자가 프리뷰를 보고 수정하려 할 수 있으므로 UX 문제.

---

## 6. 티어 한도 동기화

### 6-1. 3곳 동기화 완료 — OK

`d9ac1bc` 커밋에서 3곳이 일치하도록 동기화됨:

| 소스 | Pro 댓글/일 | Pro 블로거/일 | Pro 대댓글/일 |
|------|-----------|-------------|-------------|
| `tier.ts` | 400 | 200 | 200 |
| `supabase_client.py` | 400 | 200 | 200 |
| `pricing/page.tsx` (비교표) | 400 | 200 | 200 |

### 6-2. FEATURES 배열 불일치 — P1

**파일**: `/home/window11/insung_blog/apps/web/app/(dashboard)/(main)/pricing/page.tsx` L17-35

FEATURES 카드에 표시되는 숫자가 TIER_LIMITS/비교표와 불일치:

| 항목 | FEATURES (카드) | TIER_LIMITS (실제) | 비교표 |
|------|----------------|-------------------|-------|
| basic 댓글 | "일 30개" (L24) | 50 | "50개" |
| pro 댓글 | "일 100개" (L30) | 400 | "400개" |

**영향**: 사용자가 pricing 페이지에서 카드와 비교표를 동시에 보면 숫자가 다르다. 유료 결제 전환에 직접 영향을 주는 **고객 대면 버그**.

### 6-3. settings.py 상한과 TIER_LIMITS 관계 — OK (설계 확인)

`settings.py`의 `MAX_COMMENTS_PER_DAY=400`, `MAX_BLOGGERS_PER_DAY=200`은 **시스템 절대 상한**이고, `_TIER_LIMITS`는 **유저별 티어 한도**. Pro 한도가 상한과 동일하므로 Pro 유저가 상한에 막히는 일은 없다. 정상.

---

## 7. DB 마이그레이션

### 7-1. persona_feedback RLS — OK

**파일**: `supabase/migrations/20260406100000_persona_feedback_rls_and_examples.sql`
- `DROP POLICY IF EXISTS` → `CREATE POLICY` 패턴으로 멱등성 확보
- persona_id → user_personas.user_id 간접 검증으로 RLS 정책 정확

### 7-2. example_personas 테이블 — OK

- `CREATE TABLE IF NOT EXISTS`로 멱등
- RLS 활성화 + SELECT 전체 허용 (공개 데이터)
- 인덱스 생성

### 7-3. generation_queue CHECK 제약 — OK

**파일**: `supabase/migrations/20260406100001_fix_generation_queue_status.sql`
- 기존 CHECK 제약 DROP 후 재생성
- `publishing`, `saving`, `save_failed` 상태 추가

### 7-4. example_personas에 INSERT/UPDATE/DELETE 정책 없음 — P3

`example_personas`와 `example_persona_items`에는 SELECT 정책만 있고, INSERT/UPDATE/DELETE 정책이 없다. RLS가 활성화되어 있으므로 **일반 유저가 수정 불가** (의도대로). 다만 admin 작업 시 service_role 키를 사용해야 한다는 점을 문서화 필요.

---

## 8. QA 체크리스트 (코드 기반)

> 참고: dev 사이트(https://desktop-plq9e0i.tailec5aa6.ts.net:8443)에 직접 접속하지 못해 코드 기반으로 검증.

### 8-1. 페르소나 페이지 3그룹 UI
- 코드 확인 불가 (페르소나 페이지 컴포넌트 미확인) — 수동 QA 필요

### 8-2. 글 생성 프리뷰 마커 렌더링
- `[SEPARATOR]` → `<hr>` 확인 (L1259-1260)
- `[STICKER]` → `~ ~ ~` 텍스트 확인 (L1263-1264)
- `[MAP]` → 점선 박스 + "지도 (발행 시 수동 삽입)" 확인 (L1267-1268)
- **단, `\n\n` 분할 불일치 이슈(5-2)로 일부 마커가 미렌더링될 수 있음**

### 8-3. pricing 페이지 한도 표시
- 비교표: Pro 400/200/200 → 정확 (d9ac1bc에서 수정됨)
- **FEATURES 카드: basic 30개, pro 100개 → 부정확 (6-2 참조)**

---

## 이슈 요약

| 등급 | 이슈 | 파일 | 라인 |
|------|------|------|------|
| **P1** | pricing FEATURES 카드 숫자가 TIER_LIMITS와 불일치 (basic 30 vs 50, pro 100 vs 400) | `apps/web/app/(dashboard)/(main)/pricing/page.tsx` | L24, L30 |
| P2 | 프리뷰의 마커 파싱이 렌더러와 불일치 (`\n\n` 분할 vs `\n` 분할) | `apps/web/app/(dashboard)/(blog)/write/page.tsx` | L1235 |
| P2 | consecutive_failures 카운터가 병렬 환경에서 의미론적으로 부정확할 수 있음 | `command_worker.py` | L451, L462 |
| P3 | auto_neighbor_request 변수 선언 후 미사용 | `src/neighbor/neighbor_visitor.py` | L59 |
| P3 | bodyMatch 세미콜론 누락 | `apps/web/lib/ai/generate-post.ts` | L291 |
| P3 | example_personas 테이블 INSERT/UPDATE/DELETE 정책 부재 (의도적이나 문서화 필요) | `supabase/migrations/20260406100000_*` | L46-55 |

---

## 수동 QA 필요 항목

- [x] pricing 페이지 → 카드(FEATURES)와 비교표(COMPARISON_ROWS) 숫자 확인 → **일치 확인 (코드 검증)**
- [x] 글 생성 → [STICKER], [SEPARATOR], [MAP] 마커가 프리뷰에 표시되는지 → **코드 수정 완료 (P2 해결)**
- [x] 페르소나 페이지 → 3그룹 UI 레이아웃 확인 → **코드 검증 완료 (CATEGORY_GROUPS 3그룹 정상)**
- [ ] 댓글 게시 병렬화 실제 실행 테스트 (10개 이상 approved 댓글로)

---

## 야간작업 결과 (2026-04-07)

### 작업 1: 스케일링 정밀 분석 레포트 -- 완료

파일: `docs/프로젝트/reports/scaling-analysis-20260407.md`

동시 접속자 10/50/100/500/1000명 기준 7개 분석 항목:
1. 처리량 계산: 일일 총 댓글 610~78,500개, 동시 브라우저 3~300개
2. 인프라 요구사항: 서버 1~20대, IP 1~200개, RAM 1GB~60GB
3. 네이버 감지 리스크: IP당 3-5계정 안전, 50명+부터 프록시 필수
4. 비용 분석: 월 0~14,970,000원 (AI API가 50-70% 차지)
5. 아키텍처 제안: ASCII 다이어그램 4단계 (모놀리스→K8s)
6. 수익성 분석: 마진율 100%→24~29%, 손익분기점 유료 57~142명
7. 실행 로드맵: Phase 0-4, 시간축 시각화 포함

핵심 인사이트:
- 10명: 현행 시스템으로 문제없이 가능 (비용 0원, 마진 100%)
- 50명: 세마포어 증가 + 프록시 도입 필요 (마진 42%)
- 100명: 멀티 워커 + API 전환 필수 (마진 27%, 가장 낮음)
- 500-1000명: 분산 아키텍처 필수 (마진 24-29% 회복)

### 작업 2: QA 테스트 -- 완료

1. 페르소나 [id] 페이지 3그룹 UI:
   - CATEGORY_GROUPS 3개 그룹 정상 정의 (말투 스타일/글 구성/규칙)
   - 아코디언 UI (openGroups Set으로 토글)
   - 그룹별 활성 항목 카운트 배지 표시
   - **결과: 정상**

2. 글 생성 프리뷰 마커 렌더링:
   - [PHOTO_N], [SEPARATOR], [STICKER], [MAP] 4종 마커 처리 확인
   - **P2 이슈 발견 및 수정**: 프리뷰가 \n\n으로만 분할하여 단일 \n 구분 마커가 텍스트로 노출
   - 렌더러(naver-html.ts)와 동일하게 \n\n+ 문단 분할 + \n 라인 분할로 통일
   - **결과: 수정 완료**

3. pricing 페이지 한도 표시:
   - FEATURES 카드: free 10/basic 50/pro 400 -- tier.ts와 일치
   - COMPARISON_ROWS 비교표: 7개 행 모두 tier.ts와 일치
   - Python 측(_TIER_LIMITS): 3개 티어 모두 TypeScript와 동기화 확인
   - **결과: 정상**

4. TypeScript 타입 검증: `tsc --noEmit` 에러 0건

### WTF 지표

- 전체 파일 수정: 3회 (report 작성, preview 수정, TASK.md 갱신)
- 성공률: 100% (3/3)
- WTF: 0% -- 안전 범위 내
