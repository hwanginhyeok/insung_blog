-- 이웃찾기 AI 필터링 + 카탈로그 자산화 (Phase 0)
--
-- 3축 데이터 모델:
--   1. neighbor_blog_profile : 글로벌 블로그 카탈로그 (블로그별 1행)
--      - 7-flag 분류 (ok/ad/ai/commercial/review_farm/inactive/low_quality)
--      - 영구차단 4종 (ad/ai/commercial/low_quality)
--      - 운영 자산 (수동 수정 + 통계)
--   2. neighbor_candidates : 사용자별 후보 + 결정 이력 + 사용자 차단
--   3. bot_settings : 사용자 블로그 분야 자동 추출 컬럼 4개 추가

-- ============================================================
-- 1. 글로벌 카탈로그 (블로그 프로파일)
-- ============================================================
CREATE TABLE IF NOT EXISTS neighbor_blog_profile (
    blog_id TEXT PRIMARY KEY,
    blog_name TEXT,

    -- 활성도
    last_post_at TIMESTAMPTZ,
    post_count_30d INT DEFAULT 0,

    -- AI 추출 주제 (카탈로그용 — 분야별 분포 통계)
    main_topics TEXT[] DEFAULT '{}',

    -- 7-flag 분류 (필수)
    quality_flag TEXT NOT NULL CHECK (quality_flag IN
        ('ok', 'ad', 'ai', 'commercial', 'review_farm', 'inactive', 'low_quality')),

    -- 점수 (0~1, 참조용)
    ad_score NUMERIC(3, 2) DEFAULT 0 CHECK (ad_score >= 0 AND ad_score <= 1),
    ai_score NUMERIC(3, 2) DEFAULT 0 CHECK (ai_score >= 0 AND ai_score <= 1),

    -- 사용자에게 표시할 판정 근거
    reasoning TEXT,

    -- 분석 메타
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analyzer TEXT NOT NULL DEFAULT 'haiku-3.5',

    -- 영구 차단 (ad/ai/commercial/low_quality 자동 true, review_farm/inactive=false)
    permanently_blocked BOOLEAN NOT NULL DEFAULT FALSE,

    -- 관리자 수동 수정 (true면 자동 재분석 안 함)
    manually_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    corrected_by UUID REFERENCES users(id),
    corrected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nbp_quality ON neighbor_blog_profile(quality_flag);
CREATE INDEX IF NOT EXISTS idx_nbp_blocked ON neighbor_blog_profile(permanently_blocked)
    WHERE permanently_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_nbp_analyzed ON neighbor_blog_profile(analyzed_at);

ALTER TABLE neighbor_blog_profile ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 후보 조회 시 join용으로 읽기 가능
CREATE POLICY "neighbor_blog_profile 인증 사용자 읽기"
    ON neighbor_blog_profile FOR SELECT
    USING (auth.role() = 'authenticated');

-- 쓰기는 service_role만 (글로벌 캐시)


-- ============================================================
-- 2. 사용자별 후보 (검토 대기 + 결정 이력 + 사용자 차단)
-- ============================================================
CREATE TABLE IF NOT EXISTS neighbor_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blog_id TEXT NOT NULL,

    -- 상태
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),

    -- 사용자 분야와의 적합성 (Haiku 판정)
    relevance TEXT
        CHECK (relevance IN ('relevant', 'off_topic', 'uncertain')),
    relevance_score NUMERIC(3, 2) DEFAULT 0 CHECK (relevance_score >= 0 AND relevance_score <= 1),

    -- 추적
    source_keywords TEXT[] DEFAULT '{}',
    reasoning TEXT,

    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,

    UNIQUE (user_id, blog_id)
);

CREATE INDEX IF NOT EXISTS idx_nc_user_status ON neighbor_candidates(user_id, status);
CREATE INDEX IF NOT EXISTS idx_nc_pending ON neighbor_candidates(user_id, generated_at DESC)
    WHERE status = 'pending';

ALTER TABLE neighbor_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 후보만 조회"
    ON neighbor_candidates FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "본인 후보만 업데이트"
    ON neighbor_candidates FOR UPDATE
    USING (auth.uid() = user_id);


-- ============================================================
-- 3. bot_settings 확장 (사용자 블로그 분야 자동 추출)
-- ============================================================
ALTER TABLE bot_settings
    ADD COLUMN IF NOT EXISTS discovered_categories TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS discovered_keywords TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS categories_analyzed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auto_discover_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bot_settings.discovered_categories IS
    'AI가 사용자 본인 블로그를 분석해 추출한 분야 (Phase 1) — blog_themes(사용자 입력)와 다름';
COMMENT ON COLUMN bot_settings.discovered_keywords IS
    'AI가 추출한 발견용 검색 키워드 (Phase 1) — discover 단계에서 자동 사용';
COMMENT ON COLUMN bot_settings.auto_discover_mode IS
    'true이면 cron이 검토 단계 스킵하고 바로 추가 (Phase 5, 30건+90% 누적 후 활성화 가능)';
