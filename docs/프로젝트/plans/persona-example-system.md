# 페르소나 예시 시스템 설계 + Eng Review

> 작성일: 2026-04-06
> 상태: 설계 검토 (구현 전)

---

## 목차

1. [현황 분석](#1-현황-분석)
2. [요구사항 정리](#2-요구사항-정리)
3. [SaaS 레퍼런스 분석](#3-saas-레퍼런스-분석)
4. [DB 스키마 설계](#4-db-스키마-설계)
5. [API 엔드포인트 설계](#5-api-엔드포인트-설계)
6. [UI 변경사항](#6-ui-변경사항)
7. [예시 페르소나 데이터 설계](#7-예시-페르소나-데이터-설계)
8. [저작권 / 개인정보 검토](#8-저작권--개인정보-검토)
9. [Eng Review](#9-eng-review)
10. [구현 로드맵](#10-구현-로드맵)

---

## 1. 현황 분석

### 1.1 현재 테이블 구조

**user_personas**
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 소유자 |
| display_name | text | 표시 이름 |
| source_blog_url | text | 분석 원본 블로그 |
| crawl_status | enum | none/crawling/analyzing/done/error |
| crawl_post_count | int | 크롤링 게시물 수 |
| crawl_error | text | 에러 메시지 |
| crawled_at | timestamptz | 분석 일시 |
| is_default | bool | 기본 페르소나 여부 |
| created_at / updated_at | timestamptz | |

**persona_items**
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| persona_id | uuid (FK → user_personas) | |
| category | enum | voice/emoji/structure/ending/forbidden/custom/formatting |
| key | text | 패턴 이름 |
| value | text | 패턴 설명 |
| priority | int(1-10) | 빈도/중요도 |
| is_active | bool | 활성 여부 |
| source | enum | ai/user/feedback |
| created_at / updated_at | timestamptz | |

**persona_feedback**
- 피드백 루프용 테이블 (derived_rule → persona_items 승인 흐름)

### 1.2 현재 API

| 엔드포인트 | 메서드 | 기능 |
|-----------|--------|------|
| `/api/persona/list` | GET | 사용자 페르소나 목록 (`user_id` 필터) |
| `/api/persona/crawl` | POST | 블로그 크롤링 → user_personas upsert |
| `/api/persona/analyze` | POST | AI 2-pass 분석 → persona_items INSERT |
| `/api/persona/default` | POST | 기본 페르소나 지정 |
| `/api/persona/feedback` | GET/POST | 피드백 조회/승인/거절 |

### 1.3 RLS 현황 (Critical Finding)

**user_personas, persona_items 테이블에 RLS 정책이 없다.**

마이그레이션 파일 전수 검색 결과, `user_personas`와 `persona_items` 테이블에 대한 `ENABLE ROW LEVEL SECURITY`나 `CREATE POLICY` 문이 존재하지 않는다.

현재는 API 레이어에서 `user_id` 필터링으로 격리하고 있다:
- `list/route.ts` → `.eq("user_id", user.id)`
- `[id]/page.tsx` (클라이언트) → `.eq("user_id", user.id)`
- `crawl/route.ts` → `.eq("user_id", user.id)` 소유권 확인

하지만 클라이언트 직접 접근(Supabase JS SDK) 시에는 다른 사용자의 데이터에 접근 가능한 취약점이 있다. `[id]/page.tsx`에서 `createClient()` (클라이언트 Supabase)로 직접 `persona_items`를 조작하는 코드가 있어, RLS 없이는 `persona_id`만 알면 다른 사용자의 항목을 수정/삭제할 수 있다.

### 1.4 티어 제한

| 티어 | 페르소나 최대 수 |
|------|----------------|
| free | 1개 |
| basic | 3개 |
| pro | 10개 |

`crawl/route.ts`에서 서버 사이드로 제한 중 (신규 생성 시만).

---

## 2. 요구사항 정리

### 2.1 계정별 페르소나 분리
- [P0] RLS 정책 추가 (user_personas, persona_items)
- [P0] persona_items의 소유권 검증 — persona → user 관계 통한 간접 RLS

### 2.2 예시 페르소나 시스템
- [P1] 카테고리별 예시 페르소나 (맛집, 카페, 여행, 일상, 리뷰)
- [P1] 예시는 읽기 전용 (수정 불가)
- [P1] "복사해서 내 것으로" 기능

### 2.3 예시 데이터
- [P2] 카테고리별 대표 스타일 정의
- [P2] 저작권 안전한 데이터 생성 방법

---

## 3. SaaS 레퍼런스 분석

### 3.1 Notion 템플릿 갤러리
- **구조**: 글로벌 템플릿(Notion 제공) + 커뮤니티 템플릿 (사용자 제작 공유)
- **UX**: 카테고리 필터 → 미리보기 → "이 템플릿 사용" → 내 워크스페이스에 복사본 생성
- **핵심**: 원본은 불변, 복사본은 자유롭게 수정 가능
- **시사점**: 우리는 커뮤니티 기능까지는 불필요. admin이 관리하는 글로벌 예시만으로 충분

### 3.2 Canva 템플릿
- **구조**: Canva 큐레이션 템플릿 → 카테고리/태그 검색 → "이 템플릿 사용자 지정"
- **UX**: 미리보기가 핵심 — 결과물 먼저 보여주고 선택하게 함
- **시사점**: 페르소나는 시각적 미리보기가 어려움 → 대신 "이 스타일로 쓴 예시 글"을 보여주는 것이 효과적

### 3.3 AI 글쓰기 도구들 (Jasper, Rytr, 가제트)
- **Jasper**: 40+ 톤 프리셋 (Professional, Casual, Witty 등) + 브랜드 보이스 학습
- **Rytr**: 20+ 톤 선택 → 바로 글 생성
- **가제트(Gazet.ai)**: 키워드 기반 자동 생성, 톤 커스터마이징
- **시사점**: 톤 프리셋은 드롭다운 수준이지만, 우리는 7개 카테고리 × 다수 항목의 깊은 커스터마이징 제공. 예시는 "시작점"으로 제공하되 수정 가능해야 함

### 3.4 채택 패턴

```
[글로벌 예시 테이블] --"복사"--> [사용자 페르소나 테이블]
      (읽기 전용)                    (완전 편집 가능)
```

- **별도 테이블 방식 채택** (`example_personas` + `example_persona_items`)
- `is_example` 플래그 방식보다 별도 테이블이 적합한 이유:
  1. 예시는 `user_id`가 없다 (글로벌) → 기존 RLS와 충돌
  2. 예시 전용 메타데이터 필요 (카테고리, 설명, 미리보기 글, 정렬 순서)
  3. 예시와 사용자 데이터의 라이프사이클이 다름 (예시는 admin이 관리, 사용자는 자유 편집)
  4. boolean 플래그는 도메인 모델 변경의 신호 — 별도 엔티티로 분리하는 것이 정석

---

## 4. DB 스키마 설계

### 4.1 마이그레이션 1: RLS 정책 추가 (P0)

```sql
-- 파일: supabase/migrations/YYYYMMDD_persona_rls.sql

-- ① user_personas RLS
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;

-- 사용자 본인 데이터만 조회
CREATE POLICY "user_personas_select_own"
  ON user_personas FOR SELECT
  USING (auth.uid() = user_id);

-- 사용자 본인만 삽입
CREATE POLICY "user_personas_insert_own"
  ON user_personas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 사용자 본인만 수정
CREATE POLICY "user_personas_update_own"
  ON user_personas FOR UPDATE
  USING (auth.uid() = user_id);

-- 사용자 본인만 삭제
CREATE POLICY "user_personas_delete_own"
  ON user_personas FOR DELETE
  USING (auth.uid() = user_id);

-- service_role 전체 접근 (admin, worker 등 서버 사이드)
CREATE POLICY "user_personas_service_all"
  ON user_personas FOR ALL
  USING (auth.role() = 'service_role');

-- ② persona_items RLS (간접 소유권: persona → user)
ALTER TABLE persona_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persona_items_select_own"
  ON persona_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_personas
      WHERE user_personas.id = persona_items.persona_id
        AND user_personas.user_id = auth.uid()
    )
  );

CREATE POLICY "persona_items_insert_own"
  ON persona_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_personas
      WHERE user_personas.id = persona_items.persona_id
        AND user_personas.user_id = auth.uid()
    )
  );

CREATE POLICY "persona_items_update_own"
  ON persona_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_personas
      WHERE user_personas.id = persona_items.persona_id
        AND user_personas.user_id = auth.uid()
    )
  );

CREATE POLICY "persona_items_delete_own"
  ON persona_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_personas
      WHERE user_personas.id = persona_items.persona_id
        AND user_personas.user_id = auth.uid()
    )
  );

CREATE POLICY "persona_items_service_all"
  ON persona_items FOR ALL
  USING (auth.role() = 'service_role');

-- ③ persona_feedback RLS
ALTER TABLE persona_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persona_feedback_select_own"
  ON persona_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_personas
      WHERE user_personas.id = persona_feedback.persona_id
        AND user_personas.user_id = auth.uid()
    )
  );

CREATE POLICY "persona_feedback_service_all"
  ON persona_feedback FOR ALL
  USING (auth.role() = 'service_role');
```

### 4.2 마이그레이션 2: 예시 페르소나 테이블 (P1)

```sql
-- 파일: supabase/migrations/YYYYMMDD_create_example_personas.sql

-- ① 예시 페르소나 마스터 테이블
CREATE TABLE example_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,           -- URL 식별자 (예: 'matjip-casual')
  display_name text NOT NULL,          -- '맛집 캐주얼'
  description text NOT NULL,           -- '친근한 반말체로 맛집을 소개하는 스타일'
  blog_category text NOT NULL,         -- '맛집', '카페', '여행', '일상', '기타'
  tags text[] DEFAULT '{}',            -- 추가 태그 ['반말', '감성', '사진많음']
  preview_excerpt text,                -- 예시 글 미리보기 (200자 내외)
  sort_order int DEFAULT 0,            -- 카테고리 내 정렬 순서
  is_active boolean DEFAULT true,      -- 비활성화 가능 (삭제 대신)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ② 예시 페르소나 아이템 (구조 동일, persona_id 대신 example_persona_id)
CREATE TABLE example_persona_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  example_persona_id uuid NOT NULL REFERENCES example_personas(id) ON DELETE CASCADE,
  category text NOT NULL,               -- voice/emoji/structure/ending/forbidden/custom/formatting
  key text NOT NULL,
  value text NOT NULL,
  priority int DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_example_personas_category ON example_personas(blog_category);
CREATE INDEX idx_example_persona_items_persona ON example_persona_items(example_persona_id);

-- RLS: 모든 인증 사용자가 읽기 가능, 수정은 service_role만
ALTER TABLE example_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE example_persona_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "example_personas_public_read"
  ON example_personas FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "example_personas_admin_write"
  ON example_personas FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "example_persona_items_public_read"
  ON example_persona_items FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "example_persona_items_admin_write"
  ON example_persona_items FOR ALL
  USING (auth.role() = 'service_role');
```

### 4.3 database.types.ts 업데이트

```typescript
// 추가할 타입

example_personas: {
  Row: {
    id: string;
    slug: string;
    display_name: string;
    description: string;
    blog_category: string;
    tags: string[];
    preview_excerpt: string | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: { /* ... */ };
  Update: { /* ... */ };
};
example_persona_items: {
  Row: {
    id: string;
    example_persona_id: string;
    category: string;
    key: string;
    value: string;
    priority: number;
    created_at: string;
  };
  Insert: { /* ... */ };
  Update: { /* ... */ };
};
```

---

## 5. API 엔드포인트 설계

### 5.1 신규 API

| 엔드포인트 | 메서드 | 기능 | 인증 |
|-----------|--------|------|------|
| `/api/persona/examples` | GET | 예시 목록 (카테고리 필터) | 인증 사용자 |
| `/api/persona/examples/[slug]` | GET | 예시 상세 (items 포함) | 인증 사용자 |
| `/api/persona/clone` | POST | 예시 → 내 페르소나 복사 | 인증 사용자 |

### 5.2 API 상세

**GET /api/persona/examples**
```
Query: ?category=맛집 (선택)
Response: {
  examples: [
    {
      id, slug, display_name, description,
      blog_category, tags, preview_excerpt,
      item_count: number  // JOIN으로 계산
    }
  ]
}
```

**GET /api/persona/examples/[slug]**
```
Response: {
  persona: { id, slug, display_name, description, ... },
  items: [
    { category, key, value, priority }
  ]
}
```

**POST /api/persona/clone**
```
Body: { exampleSlug: string, displayName?: string }

로직:
  1. 인증 확인
  2. 티어별 페르소나 수 제한 확인
  3. example_personas에서 해당 slug 조회
  4. user_personas에 새 레코드 INSERT
     - user_id = 현재 사용자
     - display_name = 요청 이름 || 예시 이름 + " (복사본)"
     - source_blog_url = null (크롤링 없이 생성)
     - crawl_status = 'done' (바로 사용 가능)
  5. example_persona_items → persona_items 복사
     - source = 'example' (신규 소스 타입 추가)
  6. 첫 페르소나면 is_default = true

Response: { personaId: string, itemCount: number }
```

### 5.3 기존 API 수정사항

- `persona_items.source` enum에 `'example'` 추가 필요 (마이그레이션)
- `list/route.ts` — 변경 없음 (이미 user_id 필터)
- `crawl/route.ts` — 변경 없음 (예시 복사는 clone API에서 처리)

---

## 6. UI 변경사항

### 6.1 페르소나 목록 페이지 (`persona/page.tsx`)

**변경 전**: "새 페르소나 추가" 버튼 하나

**변경 후**:
```
┌─────────────────────────────────────────────┐
│  페르소나 관리                                 │
│  여러 블로그 스타일을 등록하고 글쓰기 시 선택     │
│                                              │
│  [새 페르소나 추가]  [예시에서 선택]              │
├─────────────────────────────────────────────┤
│                                              │
│  ── 내 페르소나 ──                             │
│  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │ 맛집A  │  │ 여행B  │  │ 일상C  │          │
│  │ 기본   │  │        │  │        │          │
│  └────────┘  └────────┘  └────────┘         │
│                                              │
│  ── 예시 페르소나 (클릭하여 복사) ──            │
│                                              │
│  [맛집] [카페] [여행] [일상] [기타]  ← 필터     │
│                                              │
│  ┌────────────────┐  ┌────────────────┐     │
│  │ 🍜 맛집 캐주얼  │  │ ☕ 카페 감성    │     │
│  │ 친근한 반말체   │  │ 분위기 중심     │     │
│  │ [미리보기]      │  │ [미리보기]      │     │
│  │ [내 것으로 복사] │  │ [내 것으로 복사] │    │
│  └────────────────┘  └────────────────┘     │
└─────────────────────────────────────────────┘
```

### 6.2 예시 미리보기 모달

예시를 클릭하면 모달에서 상세 항목 확인:
- 페르소나 설명
- 카테고리별 항목 요약 (읽기 전용)
- 예시 글 미리보기 (preview_excerpt)
- "이 스타일로 시작하기" 버튼 → clone API 호출

### 6.3 복사된 페르소나 구분

- 예시에서 복사된 항목: `source: 'example'` 뱃지 표시
- 사용자가 자유롭게 수정/삭제/추가 가능 (일반 페르소나와 동일)

---

## 7. 예시 페르소나 데이터 설계

### 7.1 카테고리별 예시 목록 (초기 릴리즈)

| slug | 카테고리 | 이름 | 스타일 특징 |
|------|---------|------|-----------|
| `matjip-casual` | 맛집 | 맛집 캐주얼 | 반말, 감탄형, 오감 묘사 |
| `matjip-info` | 맛집 | 맛집 정보형 | 존댓말, 메뉴/가격/영업시간 중심 |
| `cafe-mood` | 카페 | 카페 감성 | 분위기 중심, 사진 많음, 짧은 문장 |
| `cafe-review` | 카페 | 카페 리뷰 | 커피 맛 평가, 가성비 분석 |
| `travel-diary` | 여행 | 여행 일기 | 1인칭 일기체, 시간순 서술 |
| `travel-guide` | 여행 | 여행 가이드 | 코스 추천, 팁 중심, 정보 밀도 높음 |
| `daily-warm` | 일상 | 일상 따뜻한 | 소소한 일상 기록, 따뜻한 톤 |
| `daily-witty` | 일상 | 일상 재치 | 유머, 위트, 반전 있는 구성 |
| `review-detail` | 기타 | 꼼꼼 리뷰 | 제품/서비스 상세 분석, 장단점 명확 |
| `review-honest` | 기타 | 솔직 리뷰 | 솔직한 감상, 구어체, 공감 중심 |

### 7.2 예시 데이터 생성 방법 (저작권 안전)

**원칙: 실제 블로거 콘텐츠를 복사하지 않는다.**

데이터 생성 3단계:

1. **패턴 리서치** (수동)
   - 블로그차트(blogchart.co.kr) 주간 랭킹 참조
   - 카테고리별 상위 블로그 10~20개 열람
   - 공통 패턴만 추상화하여 메모 (특정 블로거 식별 불가 수준)

2. **AI 패턴 생성** (Claude)
   - 리서치 메모를 바탕으로 Claude에게 "한국 네이버 블로그에서 [카테고리]에 일반적으로 사용되는 글쓰기 패턴"을 요청
   - 특정 블로거를 참조하지 않는 일반적 스타일 패턴 생성
   - 각 카테고리 항목(voice, emoji, structure 등) 채움

3. **preview_excerpt 생성** (Claude)
   - 생성된 페르소나 항목을 기반으로 200자 내외의 예시 글 발췌문 생성
   - 실존 장소/상품명 사용하지 않음 (가상 장소명 사용)

### 7.3 카테고리별 대표 패턴 (리서치 결과)

**맛집 캐주얼 (`matjip-casual`) 예시 항목:**

| category | key | value | priority |
|----------|-----|-------|----------|
| voice | 반말_어미 | ~했어, ~인듯, ~거든, ~맛있더라 형태의 반말 어미 | 9 |
| voice | 감탄_표현 | "진짜", "완전", "대박", "미쳤다" 등 감탄 표현 빈번 | 8 |
| voice | 오감_묘사 | 시각(색감, 윤기), 미각(첫맛, 끝맛), 식감(꾸덕, 바삭) 묘사 | 8 |
| emoji | 음식_이모지 | 🍜🍰🔥👍 등 음식/감탄 관련 이모지 문장 끝에 사용 | 6 |
| structure | 글_레이아웃_템플릿 | text(인사+방문이유) → image → text(2줄 감상) → image → text(메뉴 설명) → image → map → text(마무리) | 9 |
| structure | 사진_배치_패턴 | text 2~3블록마다 사진 1장, 음식 사진은 연속 2장도 가능 | 8 |
| structure | 텍스트_블록_길이 | 평균 40~80자 (짧은 감상 위주) | 7 |
| structure | 오프닝_방식 | 인사 + 이곳을 찾게 된 이유 (개인적 맥락) | 8 |
| ending | 마무리_패턴 | 영업시간/주소 정리 → 추천 멘트 → 해시태그 | 7 |
| forbidden | 금지_표현 | 과도한 광고 어투 ("강력 추천합니다", "꼭 방문해보세요") 금지 | 6 |
| formatting | primary_font | nanumgothic 또는 nanumbareunhipi | 7 |
| formatting | line_spacing | 문단 사이 빈 줄 1~2개 | 7 |

**카페 감성 (`cafe-mood`) 핵심 차이:**
- voice: 짧은 문장 위주, 시적 표현, "~했다" 단문체
- structure: 사진 비중 높음 (text 1블록 : image 1~2장), 인테리어/분위기 사진 우선
- emoji: 감성 이모지 (☕✨🌿🤎) 사용
- ending: "오늘도 좋은 하루" 류의 따뜻한 마무리

**여행 일기 (`travel-diary`) 핵심 차이:**
- voice: 1인칭 일기체, 시간순 서술 ("아침에 일어나서~", "점심은~")
- structure: 긴 텍스트 블록 (100~200자), 장소 전환마다 separator 사용
- custom: "오늘의 여행 경비" 같은 정보 박스 패턴

### 7.4 시딩 방법

```bash
# 방법 1: SQL 시딩 파일
supabase/seed/example_personas.sql

# 방법 2: API 시딩 스크립트
scripts/seed-examples.ts  # admin client로 INSERT
```

**추천: SQL 시딩 파일**
- 마이그레이션과 함께 버전 관리
- `supabase db reset` 시 자동 적용
- 수정 이력 추적 가능

---

## 8. 저작권 / 개인정보 검토

### 8.1 저작권

| 항목 | 위험도 | 대응 |
|------|--------|------|
| 특정 블로거 글 복사 | **높음** | 절대 금지. 패턴만 추상화 |
| 블로그 스타일 패턴 추출 | **낮음** | 아이디어/스타일은 저작권 보호 대상 아님 |
| 예시 글 미리보기 | **낮음** | AI가 가상 데이터로 새로 생성 |
| 블로그차트 랭킹 참조 | **낮음** | 공개 데이터, 단순 참조 (크롤링 아님) |

**결론**: 예시 페르소나 데이터는 일반적 패턴의 추상화이므로 저작권 이슈 없음. 단, 특정 블로거를 식별할 수 있는 수준의 모방은 금지.

### 8.2 개인정보

| 항목 | 위험도 | 대응 |
|------|--------|------|
| 블로거 ID/이름 수집 | **높음** | 예시 데이터에 실명/ID 포함 금지 |
| 블로그 URL 저장 | **중간** | 기존 기능 (사용자 본인 블로그만) |
| 예시 데이터 | **없음** | AI 생성, 개인정보 없음 |

**결론**: 예시 페르소나는 AI가 일반적 패턴으로 생성하므로 개인정보 이슈 없음.

### 8.3 크롤링 관련 (기존 기능)

한국법상 크롤링의 허용범위 참고사항:
- 사용자가 자기 블로그를 분석하는 것은 정당한 사용
- 타인 블로그 URL 입력 시 → robots.txt 준수 + 공개 데이터만 수집
- 대법원 2022. 5. 12. 선고 2021도1533: 크롤링 자체보다 수집 목적과 방법이 핵심

---

## 9. Eng Review

### 9.1 Architecture Review

#### [CRITICAL] RLS 부재 — 데이터 격리 취약점

**현재 상태**: `user_personas`, `persona_items`, `persona_feedback` 3개 테이블 모두 RLS 미적용.

**영향**:
- `[id]/page.tsx`에서 `createClient()` (클라이언트 Supabase)를 사용하여 직접 DB 접근
  - `toggleItem()`: `persona_items` UPDATE — persona_id만 알면 다른 사용자 항목 수정 가능
  - `deleteItem()`: `persona_items` DELETE — 동일한 취약점
  - `addItem()`: `persona_items` INSERT — persona_id 주입 시 다른 사용자 페르소나에 항목 추가 가능
  - `handleSaveName()`: `user_personas` UPDATE — id만 알면 다른 사용자 페르소나 이름 변경 가능
  - `saveCategoryPrompt()`: `persona_items` INSERT/UPDATE/DELETE — 동일
- 브라우저 콘솔에서 Supabase JS SDK로 직접 쿼리 실행 가능

**즉시 조치 필요**: 마이그레이션 1 (섹션 4.1)을 최우선으로 적용.

**추가 권장**: 클라이언트에서 직접 DB 조작하는 코드를 서버 API로 이전 검토 (장기).

#### [GOOD] API 레이어 인증

모든 API 라우트에서 `supabase.auth.getUser()` + 소유권 확인 패턴이 일관적으로 적용되어 있음. `crawl`, `analyze`, `default`, `feedback` 모두 `user_id` 검증 후 처리.

#### [GOOD] Admin Client 분리

`createAdminClient()` (service_role)와 `createClient()` (anon)의 분리가 명확. 서버 API에서는 admin client, 클라이언트에서는 anon client 사용.

#### [CONCERN] 별도 테이블 vs 플래그 — 복잡도

별도 테이블은 코드 중복을 수반한다:
- `example_persona_items`와 `persona_items`의 구조가 거의 동일
- clone API에서 테이블 간 복사 로직 필요
- 타입 정의 중복

**판정**: 별도 테이블이 맞다. 이유:
- RLS 정책이 근본적으로 다름 (글로벌 읽기 vs 소유자만)
- user_id 컬럼 존재 여부 차이
- 라이프사이클 분리 (admin 관리 vs 사용자 자유 편집)
- 복사 로직은 단순한 INSERT ... SELECT 수준

### 9.2 Code Quality

#### [ISSUE] 클라이언트 직접 DB 접근 패턴

`[id]/page.tsx`에서 다수의 Supabase 직접 호출:
```typescript
// toggleItem, deleteItem, addItem, handleSaveName, saveCategoryPrompt
const supabase = createClient();
await supabase.from("persona_items").update(...).eq("id", itemId);
```

**문제점**:
1. RLS 없으면 보안 취약
2. 에러 핸들링 불일치 (일부는 무시, 일부만 UI 반영)
3. 낙관적 업데이트 (DB 실패 시 UI 불일치)

**개선안** (장기):
- 이 직접 접근들을 `/api/persona/items` API로 통합
- 또는 RLS 적용 후 현행 유지 (RLS가 보안 보장)

#### [GOOD] 타입 안전성

`database.types.ts`에 Row/Insert/Update 타입이 잘 정의되어 있음. enum 타입 (crawl_status, source)도 명시적.

#### [MINOR] persona_items.source enum 확장

clone 기능 추가 시 `'example'` 소스 추가 필요. 현재:
```typescript
source: "ai" | "user" | "feedback";
// → source: "ai" | "user" | "feedback" | "example";
```

DB 마이그레이션:
```sql
-- persona_items source에 'example' 값 허용
-- (text 타입이면 추가 DDL 불필요, enum이면 ALTER TYPE 필요)
```

### 9.3 Test Coverage

#### [GAP] API 테스트 부재

현재 페르소나 관련 API의 자동 테스트가 없다. 최소한 아래 시나리오의 테스트 필요:

| 테스트 | 우선순위 | 내용 |
|--------|---------|------|
| RLS 격리 | P0 | 사용자 A가 사용자 B의 persona_items에 접근 불가 확인 |
| clone 정합성 | P1 | 예시 복사 후 항목 수 일치, source='example' 확인 |
| 티어 제한 | P1 | free 사용자 2번째 clone 시 403 반환 확인 |
| 예시 목록 필터 | P2 | category 필터링 정상 동작 확인 |

#### [RECOMMENDATION] 테스트 전략

```
// 구문 검증 (PostToolUse 자동)
py_compile 또는 tsc --noEmit

// 단위 테스트 (신규 추가)
tests/api/persona/
  test_examples_list.py
  test_clone.py
  test_rls_isolation.py

// E2E 테스트 (Playwright)
tests/e2e/persona/
  test_example_browse_and_clone.spec.ts
```

### 9.4 Performance

#### [OK] 예시 데이터 규모

초기 10개 예시 × 12~15개 items = ~150 rows. 성능 이슈 없음.

#### [CONCERN] clone API — 2회 DB 왕복

```
1. example_persona + items SELECT
2. user_personas INSERT
3. persona_items INSERT (bulk)
```

3회 왕복이지만 데이터 양이 적어(~15 items) 병목 아님. N+1 쿼리는 없다.

#### [FUTURE] 예시 캐싱

예시 목록은 변경 빈도가 매우 낮다 (admin이 수동 업데이트). 클라이언트 사이드 캐싱 또는 ISR(Incremental Static Regeneration) 적용 가능:
```
// Next.js Route Handler 캐싱
export const revalidate = 3600; // 1시간
```

#### [OK] RLS 서브쿼리 성능

`persona_items` RLS의 EXISTS 서브쿼리:
```sql
EXISTS (SELECT 1 FROM user_personas WHERE id = persona_id AND user_id = auth.uid())
```
`user_personas.id`는 PK이므로 인덱스 스캔. 사용자당 페르소나 수가 적어(최대 10) 성능 영향 무시.

### 9.5 종합 평가

| 영역 | 등급 | 요약 |
|------|------|------|
| 보안 (RLS) | **C** → 수정 후 **A** | RLS 부재가 가장 큰 문제. 마이그레이션 적용 시 해결 |
| API 설계 | **B+** | 인증/인가 패턴 일관적, 에러 핸들링 양호 |
| 코드 품질 | **B** | 클라이언트 직접 DB 접근은 개선 여지, 타입 안전성 양호 |
| 테스트 | **D** | 자동 테스트 부재. RLS 테스트 최우선 |
| 성능 | **A** | 데이터 규모 작고, N+1 없고, 인덱스 적절 |
| 아키텍처 | **B+** | 별도 테이블 방식 적절, 관심사 분리 양호 |

---

## 10. 구현 로드맵

### Phase 1: 보안 강화 (P0, 1일)
- [ ] 마이그레이션: user_personas + persona_items + persona_feedback RLS
- [ ] RLS 격리 테스트 작성 + 실행
- [ ] supabase db push 실행

### Phase 2: 예시 테이블 + API (P1, 2일)
- [ ] 마이그레이션: example_personas + example_persona_items 테이블
- [ ] persona_items source enum 확장 ('example' 추가)
- [ ] database.types.ts 업데이트
- [ ] GET /api/persona/examples 구현
- [ ] GET /api/persona/examples/[slug] 구현
- [ ] POST /api/persona/clone 구현
- [ ] 단위 테스트 작성

### Phase 3: UI 구현 (P1, 2일)
- [ ] persona/page.tsx — 예시 섹션 추가
- [ ] 예시 미리보기 모달 컴포넌트
- [ ] 카테고리 필터 UI
- [ ] "내 것으로 복사" 버튼 + 로딩 상태
- [ ] 복사된 페르소나의 'example' 소스 뱃지

### Phase 4: 예시 데이터 시딩 (P2, 2일)
- [ ] 카테고리별 패턴 리서치 (블로그차트 참조)
- [ ] Claude로 10개 예시 페르소나 데이터 생성
- [ ] preview_excerpt 생성
- [ ] SQL 시딩 파일 작성 (supabase/seed/)
- [ ] 시딩 실행 + 검증

### Phase 5: 테스트 + QA (P1, 1일)
- [ ] RLS 격리 E2E 테스트
- [ ] clone 정합성 테스트
- [ ] 티어 제한 테스트
- [ ] UI 수동 QA

**총 예상 소요: 8일 (병렬 가능 항목 고려 시 5~6일)**

---

## 참고 자료

- [Notion 템플릿 갤러리](https://www.notion.com/templates)
- [데이터 크롤링의 한국법상 허용기준](https://www.mondaq.com/copyright/1266554)
- [웹 크롤링은 합법일까, 불법일까? (Listly)](https://www.listly.io/help/ko/guide/%EC%9B%B9-%ED%81%AC%EB%A1%A4%EB%A7%81%EC%9D%80-%ED%95%A9%EB%B2%95%EC%9D%BC%EA%B9%8C-%EB%B6%88%EB%B2%95%EC%9D%BC%EA%B9%8C/)
- [블로그차트 주간 랭킹](https://www.blogchart.co.kr/chart/week)
- [AI 글쓰기 도구 페르소나 패턴 (builtabot)](https://www.builtabot.com/blog/ai-chatbot-persona-examples-personality-templates-2025)
- [SaaS Database Design 가이드 (GeeksforGeeks)](https://www.geeksforgeeks.org/dbms/design-database-for-saas-applications/)
- [SQL Anti-pattern: Boolean Flags](https://bluecollardev.io/sql-anti-pattern-never-use-boolean-flags)
