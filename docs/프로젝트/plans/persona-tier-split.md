# 페르소나 티어 분리 + 용도별 3분할 설계

> 작성일: 2026-04-11
> 갱신: 2026-04-11 (eng-review 결정 6건 반영)
> 상태: **Phase 1 완료, Phase 2 진입**
> 선행 문서: [persona-example-system.md](persona-example-system.md)

---

## 1. 배경

### 1.1 해결하려는 문제

현재 페르소나 시스템은 구조적으로 3가지 문제가 있다.

1. **"통짜 페르소나" 구조** — `persona_items`에 `purpose` 컬럼이 없어서 글쓰기/댓글/대댓글이 동일한 항목을 공유. 런타임에 `persona_builder.py`가 카테고리 필터로만 분리.
2. **티어 차별화 부재** — 현재 차이는 "몇 개까지 만들 수 있느냐"(free=1, basic=3, pro=10)뿐. Pro로 업그레이드할 결정적 이유가 약함.
3. **예시 페르소나 일괄 로드** — `/api/persona/examples`가 init 시 84개 항목 전체 fetch. 탭 분류는 있으나 클라이언트 필터링만. 사용자 체감상 "너무 많다".

### 1.2 방향 전환

- **Basic**: 시스템 기본(카테고리별) + 예시 무제한 복사 + **본인 페르소나 1개 편집**
- **Pro**: 위 전부 + **용도별 3분할 독립 설정** + **본인 페르소나 무제한** + 고급 편집 UX

---

## 2. 목표

1. 블로그 카테고리별 시스템 기본 페르소나 시딩 (맛집/카페/여행/일상/리뷰 …) — 누구나 바로 사용 가능
2. Basic 사용자도 자신의 페르소나 1개를 직접 편집 가능 (최소한의 커스터마이징)
3. Pro 사용자는 글쓰기/댓글/대댓글 3용도를 **독립된 페르소나**로 운용 가능
4. 기존 사용자 데이터 무손실 마이그레이션
5. 예시 페르소나 탭 lazy loading + Supabase max_rows 회피

---

## 3. 티어 정책 (확정)

### 3.1 기능 매트릭스

| 기능 | Free | Basic | Pro |
|------|:----:|:-----:|:---:|
| 시스템 기본 페르소나 (카테고리별) 사용 | ✅ | ✅ | ✅ |
| 예시 페르소나 복사 | 1개 (읽기) | **무제한** | 무제한 |
| 본인 페르소나 보유 | 1개 (**읽기 전용**) | 1개 (편집 가능) | 무제한 (편집 가능) |
| 본인 페르소나 생성 | ❌ | ✅ | ✅ |
| 본인 페르소나 편집 | ❌ | ✅ | ✅ |
| 용도별 3분할 독립 설정 (writing/comment/reply) | ❌ | ❌ | ✅ |
| 페르소나 편집 고급 UX (팝업/비교/드래그) | ❌ | ❌ | ✅ |
| 글 생성 월 한도 | 5회 | 30회 | 무제한 |
| 이웃봇 | ❌ | ✅ | ✅ |

### 3.2 확정된 정책 (2026-04-11 사용자 승인)

**Free 티어**:
- 본인 페르소나 1개를 보유하지만 **편집 불가** (시스템 제공 페르소나 중 하나를 선택해서 "활성"으로 지정만 가능)
- 실제 저장되는 `user_personas` 레코드는 없음 — 시스템 페르소나를 `bot_settings.active_*_persona_id`로 직접 참조
- 예시 페르소나는 1개까지 "읽기 전용 선택" 가능 (복사 없이 시스템 페르소나처럼 바로 사용)

**Basic → Free 다운그레이드**:
- Basic에서 만든 본인 페르소나 1개는 `locked=true`로 보관
- Free에서는 접근 불가 (잠금 배지 표시)
- 재업그레이드 시 자동 복구

**Pro → Basic 다운그레이드**:
- Pro에서 만든 본인 페르소나 중 **가장 최근 `updated_at` 1개만 유지** (locked=false)
- 나머지 전부 `locked=true`로 보관
- `purpose` 용도별 분리도 해제 → 3슬롯 모두 동일 페르소나(`purpose='all'`)로 통합
- 재업그레이드 시 잠긴 페르소나 복구 + 용도별 분리 재활성화

---

## 4. 데이터 모델 변경

### 4.1 user_personas (스키마 추가) — Phase 1 적용 완료

Phase 1에서 추가된 컬럼: `purpose`, `is_system`, `locked`, `category`

**purpose의 의미 (eng-review P2 결정 = A)**:
- **사용자 페르소나** (`is_system=false`): 항상 `purpose='all'` — 활성화는 100% `bot_settings.active_*_persona_id`가 결정
- **시스템 페르소나** (`is_system=true`): `purpose='writing' | 'comment' | 'reply'` — 라이브러리 분류용

→ Phase 2 마이그레이션에서 추가 제약: `is_system=false`인 행은 `purpose='all'` 강제. CHECK 제약 추가.

```sql
-- Phase 2 마이그레이션에서 추가
ALTER TABLE user_personas
    ADD CONSTRAINT chk_user_persona_purpose_all
    CHECK (
        is_system = TRUE
        OR (is_system = FALSE AND purpose = 'all')
    );
```

### 4.2 bot_settings (활성 페르소나 포인터 추가)

```sql
ALTER TABLE bot_settings
  ADD COLUMN active_writing_persona_id UUID REFERENCES user_personas(id),
  ADD COLUMN active_comment_persona_id UUID REFERENCES user_personas(id),
  ADD COLUMN active_reply_persona_id UUID REFERENCES user_personas(id);
```

→ Basic 사용자는 3개 슬롯에 동일한 1개 페르소나(`purpose='all'`)를 가리킴
→ Pro 사용자는 3개 슬롯을 독립적으로 선택

### 4.3 example_personas (purpose 태그 추가)

```sql
ALTER TABLE example_personas
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'writing'
    CHECK (purpose IN ('writing', 'comment', 'reply', 'all'));

CREATE INDEX idx_example_personas_purpose ON example_personas (purpose);
```

### 4.4 시스템 기본 페르소나 시딩 — Phase 1 완료

```
user_personas (is_system=true, user_id=NULL)
├── 블로그 글쓰기 기본 - 맛집          (purpose=writing)
├── 블로그 글쓰기 기본 - 카페          (purpose=writing)
├── 블로그 글쓰기 기본 - 여행          (purpose=writing)
├── 블로그 글쓰기 기본 - 일상          (purpose=writing)
├── 블로그 글쓰기 기본 - 리뷰          (purpose=writing)
├── 친근한 댓글 기본                   (purpose=comment)
└── 블로그 주인 답글 기본              (purpose=reply)
```

→ `user_id IS NULL` + `is_system=true`로 글로벌 페르소나 표현
→ RLS 정책: `user_id IS NULL AND is_system = TRUE`인 경우 모든 인증 사용자 SELECT 허용

### 4.5 persona_preview_samples (Phase 2 신규)

페르소나 선택 전 결과물 미리보기용. 정적 시딩 + Pro 실시간 생성 하이브리드.

```sql
CREATE TABLE persona_preview_samples (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id      UUID NOT NULL REFERENCES user_personas(id) ON DELETE CASCADE,
    sample_type     TEXT NOT NULL CHECK (sample_type IN ('writing', 'comment', 'reply')),
    topic           TEXT,                                              -- "강남 맛집 방문기" 등
    content         TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    generated_by    TEXT NOT NULL DEFAULT 'system'
        CHECK (generated_by IN ('system', 'ai_preview')),              -- system: 시딩, ai_preview: Pro 실시간 생성
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_preview_samples_persona_type
    ON persona_preview_samples(persona_id, sample_type);

ALTER TABLE persona_preview_samples ENABLE ROW LEVEL SECURITY;

-- 시스템 페르소나의 샘플은 모든 인증 사용자 읽기 허용
-- 본인 페르소나의 샘플은 본인만 읽기
CREATE POLICY "preview_samples_select" ON persona_preview_samples
    FOR SELECT
    USING (
        persona_id IN (
            SELECT id FROM user_personas
            WHERE user_id = auth.uid() OR is_system = TRUE
        )
    );
```

**시딩 개수 (eng-review 결정 6 = A)**:
- 글쓰기 기본 페르소나 5개 × 글쓰기 샘플 2개 = 10건
- 댓글 기본 페르소나 1개 × 댓글 샘플 3개 = 3건
- 답글 기본 페르소나 1개 × 답글 샘플 3개 = 3건
- **총 16건** 정적 시딩

**실시간 생성** (Pro 한정, Phase 4 → `PERSONA-PREVIEW-LIVE` 태스크):
- 본인 페르소나 미리보기 탭에 "🔄 미리보기 생성" 버튼
- 클릭 시 Claude API로 즉석 생성 → `generated_by='ai_preview'`로 캐싱
- `monthly_gen_count` 차감 (글 1회 분량으로 처리)
- Phase 2 범위 외

---

## 5. 마이그레이션 전략

### 5.1 Phase 1 (완료) — 기본 호환성 보존

기존 사용자 페르소나는 모두 `purpose='all'`로 세팅, `bot_settings` 3슬롯이 동일한 `is_default` 페르소나를 가리키도록 자동 연결. **동작 변화 0**.

### 5.2 Phase 2 마이그레이션 — 'all' 제거 (eng-review 결정 P5 = A)

`persona_builder.py`의 분기 복잡도를 줄이기 위해 'all' 개념 자체를 제거. 기존 사용자 페르소나(`purpose='all'`)를 **3개로 복제**해서 writing/comment/reply 각각 1개씩 만들고, `bot_settings` 3슬롯이 각자 해당 복제본을 가리키도록 재연결.

```sql
-- Phase 2 마이그레이션 (의사 코드)
BEGIN;

-- 1. 기존 사용자 페르소나 'all' 행을 3개로 복제
WITH src AS (
    SELECT id, user_id, display_name, source_blog_url, crawl_status,
           crawl_post_count, crawled_at, is_default, locked, category
    FROM user_personas
    WHERE is_system = FALSE AND purpose = 'all'
),
new_writing AS (
    INSERT INTO user_personas (user_id, display_name, source_blog_url, crawl_status,
                                crawl_post_count, crawled_at, is_default, locked,
                                category, purpose, is_system)
    SELECT user_id, display_name, source_blog_url, crawl_status,
           crawl_post_count, crawled_at, is_default, locked,
           category, 'writing', FALSE
    FROM src
    RETURNING id, user_id
)
-- 마찬가지로 comment, reply 복제 + persona_items도 복제
-- bot_settings.active_*_persona_id를 새 ID로 재연결
-- 기존 'all' 행 삭제

-- 2. user 페르소나는 'all' 금지하는 CHECK 제약 추가
ALTER TABLE user_personas
    ADD CONSTRAINT chk_user_persona_purpose_all
    CHECK (
        is_system = TRUE
        OR (is_system = FALSE AND purpose IN ('writing','comment','reply'))
    );

COMMIT;
```

→ **persona_builder.py 단순화**: `active_*_persona_id` 1번 조회 → 그 페르소나 items로 빌드. 분기 1개.

→ **데이터 비용**: 사용자 1명 × 페르소나 1개 × persona_items ~20개 → ×3 = 60개. 사용자 수십 명까지는 무의미한 비용.

### 5.3 다운그레이드 트리거 — Phase 4 분리 (eng-review 결정 4 = C)

플랜 § 3.2의 다운그레이드 정책은 코드 미구현 상태로 둠. **결제 사용자가 0명**인 현 시점에서 우선순위 낮음. `PREPARED_TASK.md`의 `PERSONA-DOWNGRADE` 태스크로 분리.

Phase 2/3에서는 다음만 보장:
- `locked=true` 페르소나는 RLS UPDATE 정책으로 편집 차단
- 잠긴 페르소나도 SELECT는 가능 (UI에 "잠김" 배지로 표시)
- 활성 슬롯 지정 시 `locked=false` 검증

---

## 6. API 변경

### 6.1 신규/수정 엔드포인트

| 엔드포인트 | 메서드 | 변경 | 설명 |
|-----------|--------|------|------|
| `/api/persona/examples` | GET | 수정 | `?category=` + `?purpose=` 파라미터 추가, 페이지네이션 |
| `/api/persona/system` | GET | 신규 | 시스템 기본 페르소나 목록 (`?purpose=writing\|comment\|reply` 필터) |
| `/api/persona/list` | GET | 수정 | 응답에 `purpose`, `is_system`, `locked` 포함 |
| `/api/persona/create` | POST | 수정 | 티어 한도 체크 (Basic 1개 / Pro 무제한), `purpose='all'` 강제 입력 (사용자 페르소나는 항상 all → Phase 2 이후 writing 복제는 마이그레이션이 처리) |
| `/api/persona/activate` | POST | 신규 | 용도별 활성 페르소나 지정 (`{purpose, persona_id}`). 동시 호출 안전성: `bot_settings` row update 1회 |
| `/api/persona/preview/[id]` | GET | 신규 | 페르소나 미리보기 샘플 조회 (sample_type별 그룹) |
| `/api/persona/preview/generate` | POST | 신규 (Phase 4) | Pro 한정 실시간 미리보기 생성. `monthly_gen_count` 차감 |

### 6.2 티어 게이팅 (신규)

`lib/tier.ts`에 확장:

```typescript
export const TIER_LIMITS = {
  free:  { ..., maxCustomPersonas: 0, purposeSplit: false },
  basic: { ..., maxCustomPersonas: 1, purposeSplit: false },
  pro:   { ..., maxCustomPersonas: 9999, purposeSplit: true },
};

export async function checkPersonaQuota(userId: string): Promise<{
  allowed: boolean; used: number; limit: number; tier: Tier;
}>;
```

### 6.3 persona_builder.py 수정 (eng-review 결정 P5 = A 반영)

'all' 폴백 로직 제거. Phase 2 마이그레이션이 'all'을 3개로 복제하므로 빌더는 단순 1-step 조회.

```python
def load_persona_prompt(user_id: str, purpose: Literal['writing','comment','reply']) -> str:
    # 1. bot_settings에서 active_{purpose}_persona_id 조회
    # 2. NULL이면 시스템 기본 페르소나로 fallback (purpose 매칭, 카테고리는 첫 번째)
    # 3. 페르소나 items 조회 → 프롬프트 빌드
    # 4. (호환 분기 없음 — 'all'은 마이그레이션에서 제거됨)
```

---

## 7. UI 변경 (eng-review 결정 P1 = A 반영)

페르소나 활성화는 **사용처에서 직접 관리**. `/persona`는 라이브러리 역할만.

### 7.1 페르소나 페이지 (`apps/web/app/persona/page.tsx`) — 라이브러리

```
┌─ 활성 페르소나 현황 (읽기 전용 요약, 변경은 각 사용처에서) ─┐
│ 📝 글쓰기  → 블로그 글쓰기 기본 - 맛집  (변경: /write)     │
│ 💬 댓글    → 친근한 댓글 기본          (변경: /bot)         │
│ 🙌 답글    → 블로그 주인 답글 기본      (변경: /bot)         │
└──────────────────────────────────────────────────────┘

┌─ 내 페르소나 라이브러리 ─────────────────────────────┐
│ [카드 1] [카드 2] [카드 3] [+ 생성]                  │
│   ↓ 카드 클릭 → 상세 모달 (탭 2개)                  │
│   ┌──────────────────────────────────────┐          │
│   │ [편집]  [미리보기]                    │          │
│   │                                      │          │
│   │ [편집] 탭: 카테고리별 항목 CRUD         │          │
│   │                                      │          │
│   │ [미리보기] 탭:                        │          │
│   │   📝 글쓰기 예시 (2개)                 │          │
│   │   💬 댓글 예시 (3개)                   │          │
│   │   🙌 답글 예시 (3개)                   │          │
│   │   (Pro 한정: "🔄 미리보기 생성" 버튼)   │          │
│   └──────────────────────────────────────┘          │
│                                                     │
│ Basic: 본인 페르소나 1개 한도, 초과 시 생성 버튼 잠금 │
│ Pro:   무제한 생성                                   │
│ locked 상태는 반투명 + "Pro 업그레이드로 복구"        │
└──────────────────────────────────────────────────────┘

┌─ 예시 페르소나 갤러리 ─────────────────────────────────┐
│ 카테고리 탭: [전체][맛집][카페][여행][일상][리뷰]       │
│ 탭 클릭 시 ?category= 쿼리로 서버 재요청 (lazy loading) │
│ 한 번에 5~10개 + "더보기" 페이지네이션                  │
│ 각 카드도 동일하게 [편집불가][미리보기] 모달            │
└──────────────────────────────────────────────────────┘
```

### 7.2 글쓰기 페이지 (`apps/web/app/write/page.tsx`) — 글쓰기 활성 페르소나

에디터 상단 툴바에 **글쓰기 페르소나 셀렉터** 추가.

```
┌─────────────────────────────────────────┐
│ 글쓰기 페르소나: [블로그 글쓰기 기본 - 맛집 ▾]│
│   - Basic: 시스템 기본 + 본인 1개 + 복사한 예시 │
│   - Pro:   위 + 본인 N개 (writing 슬롯)        │
└─────────────────────────────────────────┘
```

선택 시 `POST /api/persona/activate { purpose: 'writing', persona_id }` 호출. 변경 즉시 다음 글 생성에 반영.

### 7.3 댓글봇 페이지 (`apps/web/app/bot/page.tsx`) — 댓글/답글 활성 페르소나

기존 봇 설정 섹션 아래 **"댓글 페르소나" 섹션** 추가.

```
┌─ 댓글 페르소나 설정 ─────────────────────┐
│ 💬 댓글:    [친근한 댓글 기본 ▾]          │
│ 🙌 대댓글:  [블로그 주인 답글 기본 ▾]      │
│                                        │
│ Basic: 시스템 기본만 노출 (단일 옵션)     │
│ Pro:   본인 페르소나 + 시스템 기본 모두 노출 │
└──────────────────────────────────────────┘
```

각각 `POST /api/persona/activate { purpose: 'comment'|'reply', persona_id }` 호출.

### 7.4 페르소나 상세 모달 (`apps/web/app/persona/[id]/page.tsx` 또는 모달화)

탭 2개:
- **[편집]** 탭: 카테고리별 항목 CRUD (기존). `is_system=true`면 읽기 전용 + "복사해서 편집" 버튼. `locked=true`면 읽기 전용 + Pro CTA
- **[미리보기]** 탭: `GET /api/persona/preview/[id]`로 sample_type별 그룹 표시
  - Basic: 시스템 페르소나 미리보기만 (정적 시딩 결과)
  - Pro: 본인 페르소나도 가능 + "🔄 미리보기 생성" 버튼 (Phase 4)

---

## 8. 구현 단계 (Phase)

### Phase 0: 플랜 확정 ✅
- [x] 사용자 리뷰 + Q1/Q2/Q3 확정 (2026-04-11)
- [x] 이 문서 승인

### Phase 1: DB + 시스템 기본 페르소나 ✅ (2026-04-11)
- [x] 마이그레이션 파일 작성 (`supabase/migrations/20260411000000_persona_tier_split.sql`)
- [x] 시스템 기본 페르소나 시딩 스크립트 (`scripts/seed_system_personas.ts`)
- [x] remote DB 적용 완료 (supabase db push --include-all)
- [x] 시딩 실행: 시스템 페르소나 7개 + 항목 84개 생성
- [x] 검증 스크립트 (`scripts/verify_persona_tier_split.ts`) — 기존 사용자 호환성 보존 확인

### Phase 2: 백엔드 (마이그레이션 + API + persona_builder)
- [ ] **마이그레이션** `20260411T_persona_tier_split_v2.sql`:
  - [ ] 기존 'all' 사용자 페르소나 → 3개 복제 (writing/comment/reply)
  - [ ] persona_items도 복제 (FK 새 ID로)
  - [ ] bot_settings.active_*_persona_id 재연결
  - [ ] 'all' 행 삭제 후 `chk_user_persona_purpose_all` 제약 추가
  - [ ] `persona_preview_samples` 테이블 + RLS
- [ ] **시딩 확장** `seed_system_personas.ts` 또는 신규 `seed_preview_samples.ts`:
  - [ ] 글쓰기 5종 × 2 = 10건 + 댓글 3건 + 답글 3건 = **16건**
- [ ] **티어 게이팅** `apps/web/lib/tier.ts`:
  - [ ] `maxCustomPersonas` (free=0, basic=1, pro=9999)
  - [ ] `purposeSplit` (pro만 true)
  - [ ] `checkPersonaQuota()` 함수
  - [ ] `src/storage/supabase_client.py` _TIER_LIMITS 동기화
- [ ] **API**:
  - [ ] `/api/persona/examples` — `?category=` `?purpose=` + 페이지네이션
  - [ ] `/api/persona/system` — 신규
  - [ ] `/api/persona/activate` — 신규
  - [ ] `/api/persona/create` — 티어 게이팅 + 원자적 quota 체크
  - [ ] `/api/persona/preview/[id]` — 신규
  - [ ] `/api/persona/list` — 응답에 purpose/is_system/locked 추가
- [ ] **persona_builder.py** — `active_*_persona_id` 기반 단일 분기 빌드
- [ ] **테스트** (eng-review P4 갭 보완):
  - [ ] RLS: 다른 사용자 페르소나 SELECT/UPDATE 차단
  - [ ] CHECK: `is_system=true` + `user_id NULL` 강제
  - [ ] 티어 게이팅: Basic 2개째 생성 거부
  - [ ] persona_builder fallback: 활성 슬롯 NULL → 시스템 기본
  - [ ] preview API 응답 형식

### Phase 3: UI
- [ ] **/persona** 페이지 — "활성 페르소나 현황" 요약 카드 + 라이브러리 + 예시 갤러리 lazy loading
- [ ] **/write** 페이지 — 에디터 상단 글쓰기 페르소나 셀렉터
- [ ] **/bot** 페이지 — "댓글 페르소나 설정" 섹션 (댓글/답글 셀렉터 2개)
- [ ] **페르소나 상세 모달** — [편집][미리보기] 2탭 구조
- [ ] **미리보기 탭** — `persona_preview_samples`에서 sample_type별 그룹 렌더
- [ ] purpose 배지 / locked 상태 / 시스템 페르소나 읽기 전용 표시
- [ ] Basic/Pro 구분 업그레이드 CTA

### Phase 4: 마이그레이션 + 검증 + 출시
- [ ] 기존 사용자(letter_hih 포함) 마이그레이션 dry-run
- [ ] dev에서 Basic/Pro 양쪽 계정으로 실제 글쓰기/댓글/대댓글 생성 확인
- [ ] 미리보기 탭 동작 확인 (시스템 페르소나 16건 노출)
- [ ] 사용자 최종 리뷰 + 승인
- [ ] production push

### Phase 5: 분리된 후속 작업 (별도 태스크)
- `PERSONA-DOWNGRADE` (P2): 결제 사용자 발생 시 다운그레이드 트리거 구현
- `PERSONA-PREVIEW-LIVE` (P2): Pro 한정 실시간 미리보기 생성

---

## 9. 검증 계획

각 Phase마다:

1. **구문 검증**: `py_compile`, `tsc --noEmit`
2. **dev 수동 검증**:
   - Basic 계정으로 본인 페르소나 1개 생성 → 글쓰기/댓글/대댓글 모두 동일한 톤 확인
   - Pro 계정으로 3개 분리 → 글쓰기는 A, 댓글은 B, 대댓글은 C 페르소나로 생성 확인
   - 예시 페르소나 탭 전환 → 네트워크 탭에서 서버 재요청 확인
3. **사용자 리뷰**: letter_hih 계정으로 직접 체험 후 승인
4. **production push**: 사용자 승인 후에만

---

## 10. 리스크

| 리스크 | 완화 방법 |
|--------|---------|
| 기존 사용자 동작 변화 | `purpose='all'` 기본값 + 3슬롯 동일 포인터로 호환성 유지 |
| 시스템 페르소나 user_id=NULL로 인한 RLS 복잡도 | is_system 컬럼으로 명시적 정책 분리 |
| 예시 페르소나 84개 purpose 분류 재시딩 필요 | 기본 `writing` 부여 + 별도 comment/reply 예시만 추가 |
| Pro → Basic 다운그레이드 시 데이터 손실 우려 | `locked` 컬럼으로 보존, 재업그레이드 시 복구 |
| Supabase max_rows 재발 | API에 페이지네이션 + `purpose` 인덱스 |

---

## 11. 영향 범위 체크리스트

### Phase 2 코드
- [ ] `supabase/migrations/20260411T_persona_tier_split_v2.sql` — 신규 마이그레이션 (all 제거 + preview 테이블)
- [ ] `scripts/seed_preview_samples.ts` — 신규 미리보기 시딩 (16건)
- [ ] `apps/web/lib/tier.ts` — `maxCustomPersonas`, `purposeSplit`, `checkPersonaQuota`
- [ ] `src/storage/supabase_client.py` — `_TIER_LIMITS` 동기화
- [ ] `apps/web/app/api/persona/examples/route.ts` — `?category=&purpose=` + 페이지네이션
- [ ] `apps/web/app/api/persona/system/route.ts` — 신규
- [ ] `apps/web/app/api/persona/activate/route.ts` — 신규
- [ ] `apps/web/app/api/persona/preview/[id]/route.ts` — 신규
- [ ] `apps/web/app/api/persona/create/route.ts` — 티어 게이팅 + 원자적 체크
- [ ] `apps/web/app/api/persona/list/route.ts` — 응답 필드 확장
- [ ] `src/persona_builder.py` — 단일 분기 빌드
- [ ] `src/ai_comment.py`, `src/ai_reply.py` — `purpose` 전달

### Phase 3 코드
- [ ] `apps/web/app/persona/page.tsx` — 활성 현황 카드 + 라이브러리 + lazy loading
- [ ] `apps/web/app/persona/[id]/page.tsx` (또는 모달화) — [편집][미리보기] 2탭
- [ ] `apps/web/app/write/page.tsx` — 글쓰기 페르소나 셀렉터
- [ ] `apps/web/app/bot/page.tsx` — 댓글/답글 페르소나 셀렉터

### Phase 2 테스트 (eng-review P4 갭 보완)
- [ ] `apps/web/__tests__/persona/rls.test.ts` — RLS 정책
- [ ] `apps/web/__tests__/persona/tier-quota.test.ts` — 티어 한도
- [ ] `apps/web/__tests__/persona/activate.test.ts` — 활성 슬롯
- [ ] `tests/test_persona_builder.py` — fallback 동작

### 문서
- [x] `CURRENT_TASK.md` — PERSONA-TIER-SPLIT 등록 완료
- [x] `PREPARED_TASK.md` — `PERSONA-DOWNGRADE` + `PERSONA-PREVIEW-LIVE` 등록 완료
- [ ] `CLAUDE.md` — 티어 정책 섹션 갱신
- [ ] `docs/프로젝트/pricing.md` — 가격표 업데이트 (존재 시)

---

## 12. NOT in scope (eng-review 명시)

다음은 의도적으로 이번 PR/Phase 2-3에서 제외:

| 항목 | 이유 | 분리 위치 |
|------|------|---------|
| 다운그레이드 트리거 코드 | 결제 사용자 0명, 우선순위 낮음 | `PERSONA-DOWNGRADE` (P2) |
| Pro 실시간 미리보기 생성 | Claude API 비용 + UX 복잡도 | `PERSONA-PREVIEW-LIVE` (P2) |
| 페르소나 편집 고급 UX (팝업/비교/드래그) | 별도 큰 작업 | 기존 `PERSONA-EDITOR` (P1) |
| 카테고리 추가 (건강/운동 등) | 7행씩 양산 구조라 메타 분리 후 | 추후 |
| `example_personas` ↔ `user_personas(is_system)` 통합 | Phase 1 이미 다른 구조로 적용됨 | 추후 정리 |
| Free 티어 0 페르소나 정책 | "1개 읽기 전용" 결정 (Q1=A) | — |

---

## 13. What already exists (재사용)

| 기능 | 기존 코드/테이블 | 재사용 방식 |
|------|---------------|----------|
| 페르소나 CRUD | `user_personas`, `persona_items`, `persona_feedback` | 컬럼만 추가, 기존 RLS 패턴 확장 |
| 페르소나 빌더 | `src/persona_builder.py` (용도별 build_writing/comment/reply 헤더) | 용도별 헤더는 유지, items 조회만 변경 |
| 티어 한도 시스템 | `lib/tier.ts` `TIER_LIMITS` + `reserve_generation` RPC | `maxCustomPersonas` 필드 추가 + 별도 quota 함수 |
| 예시 페르소나 | `example_personas`, `example_persona_items` (Phase 1 시점 기준 Phase 1에서 추가) | `purpose` 컬럼만 추가 |
| 봇 설정 | `bot_settings` (1:1) | 컬럼 3개 추가 |
| 검증 스크립트 | `scripts/verify_persona_tier_split.ts` (Phase 1 산출물) | Phase 2 적용 후 재실행으로 회귀 확인 |
