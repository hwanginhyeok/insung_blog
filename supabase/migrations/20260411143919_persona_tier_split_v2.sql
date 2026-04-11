-- Migration: persona_tier_split_v2
-- Created: 2026-04-11
-- Description: Phase 2 — 'all' 페르소나 제거 + 미리보기 샘플 테이블
--   1. 기존 사용자 페르소나(purpose='all')를 writing/comment/reply 3개로 복제
--   2. persona_items도 동일하게 복제 (FK 새 ID로)
--   3. bot_settings.active_*_persona_id를 새 ID로 재연결
--   4. 'all' 행 삭제
--   5. 사용자 페르소나는 'all' 금지하는 CHECK 제약 추가
--   6. persona_preview_samples 테이블 신규 생성
--
-- 플랜: docs/프로젝트/plans/persona-tier-split.md § 5.2, § 4.5

BEGIN;

-- ============================================================
-- 1. 'all' 사용자 페르소나를 3개로 복제 (PL/pgSQL 블록)
-- ============================================================

-- NOTE: is_default는 Phase 2 이후 의미가 없어진다 (활성 페르소나는 bot_settings.active_*가 결정).
--       복제 시 모두 FALSE로 세팅 → partial unique index 충돌 회피 + 의미 deprecation 명시.
-- NOTE: persona_feedback은 src 삭제 시 CASCADE로 사라지므로, src 삭제 전에 writing 복제본으로 이전한다.

DO $$
DECLARE
    src RECORD;
    new_writing_id UUID;
    new_comment_id UUID;
    new_reply_id UUID;
    purpose_target TEXT;
    new_id UUID;
BEGIN
    FOR src IN
        SELECT id, user_id, display_name, source_blog_url, crawl_status,
               crawl_post_count, crawl_error, crawled_at, is_default,
               locked, category, created_at, updated_at
        FROM user_personas
        WHERE is_system = FALSE AND purpose = 'all'
    LOOP
        -- 각 용도별로 새 페르소나 생성 (is_default는 모두 FALSE)
        FOREACH purpose_target IN ARRAY ARRAY['writing', 'comment', 'reply']
        LOOP
            INSERT INTO user_personas (
                user_id, display_name, source_blog_url, crawl_status,
                crawl_post_count, crawl_error, crawled_at, is_default,
                locked, category, purpose, is_system, created_at, updated_at
            )
            VALUES (
                src.user_id,
                src.display_name,
                src.source_blog_url,
                src.crawl_status,
                src.crawl_post_count,
                src.crawl_error,
                src.crawled_at,
                FALSE,                  -- is_default 무효화 (deprecated)
                src.locked,
                src.category,
                purpose_target,
                FALSE,
                src.created_at,
                src.updated_at
            )
            RETURNING id INTO new_id;

            -- persona_items 복제
            INSERT INTO persona_items (
                persona_id, category, key, value, priority,
                is_active, source, created_at, updated_at
            )
            SELECT
                new_id, category, key, value, priority,
                is_active, source, created_at, updated_at
            FROM persona_items
            WHERE persona_id = src.id;

            -- 용도별 새 ID를 변수에 저장 (bot_settings 재연결용)
            IF purpose_target = 'writing' THEN
                new_writing_id := new_id;
            ELSIF purpose_target = 'comment' THEN
                new_comment_id := new_id;
            ELSIF purpose_target = 'reply' THEN
                new_reply_id := new_id;
            END IF;
        END LOOP;

        -- persona_feedback을 writing 복제본으로 이전 (피드백 이력 보존)
        UPDATE persona_feedback
        SET persona_id = new_writing_id
        WHERE persona_id = src.id;

        -- bot_settings의 3슬롯이 src.id를 가리키고 있다면 새 ID로 재연결
        UPDATE bot_settings
        SET active_writing_persona_id = new_writing_id
        WHERE active_writing_persona_id = src.id;

        UPDATE bot_settings
        SET active_comment_persona_id = new_comment_id
        WHERE active_comment_persona_id = src.id;

        UPDATE bot_settings
        SET active_reply_persona_id = new_reply_id
        WHERE active_reply_persona_id = src.id;

        -- 기존 'all' 행 삭제 (CASCADE로 persona_items도 삭제됨, feedback은 위에서 이전 완료)
        DELETE FROM user_personas WHERE id = src.id;
    END LOOP;
END $$;

-- ============================================================
-- 2. 사용자 페르소나는 'all' 금지하는 CHECK 제약 추가
-- ============================================================

ALTER TABLE user_personas DROP CONSTRAINT IF EXISTS chk_user_persona_purpose_all;

ALTER TABLE user_personas
    ADD CONSTRAINT chk_user_persona_purpose_all
    CHECK (
        is_system = TRUE
        OR (is_system = FALSE AND purpose IN ('writing', 'comment', 'reply'))
    );

-- ============================================================
-- 3. persona_preview_samples 테이블 신규 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS persona_preview_samples (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id      UUID NOT NULL REFERENCES user_personas(id) ON DELETE CASCADE,
    sample_type     TEXT NOT NULL CHECK (sample_type IN ('writing', 'comment', 'reply')),
    topic           TEXT,
    content         TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    generated_by    TEXT NOT NULL DEFAULT 'system'
        CHECK (generated_by IN ('system', 'ai_preview')),
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preview_samples_persona_type
    ON persona_preview_samples (persona_id, sample_type);

CREATE INDEX IF NOT EXISTS idx_preview_samples_sort
    ON persona_preview_samples (persona_id, sample_type, sort_order);

-- ============================================================
-- 4. RLS — 시스템 페르소나 샘플은 모든 인증 사용자, 본인 페르소나 샘플은 본인만
-- ============================================================

ALTER TABLE persona_preview_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preview_samples_select_own_or_system" ON persona_preview_samples;

CREATE POLICY "preview_samples_select_own_or_system" ON persona_preview_samples
    FOR SELECT
    USING (
        persona_id IN (
            SELECT id FROM user_personas
            WHERE user_id = auth.uid() OR is_system = TRUE
        )
    );

-- INSERT/UPDATE/DELETE는 service role 또는 본인 페르소나의 ai_preview만
DROP POLICY IF EXISTS "preview_samples_insert_ai_preview" ON persona_preview_samples;

CREATE POLICY "preview_samples_insert_ai_preview" ON persona_preview_samples
    FOR INSERT
    WITH CHECK (
        generated_by = 'ai_preview'
        AND persona_id IN (
            SELECT id FROM user_personas
            WHERE user_id = auth.uid() AND is_system = FALSE
        )
    );

-- ============================================================
-- 5. 코멘트
-- ============================================================

COMMENT ON TABLE persona_preview_samples IS '페르소나 미리보기 샘플. system: 시딩 / ai_preview: Pro 실시간 생성 (Phase 4)';
COMMENT ON COLUMN persona_preview_samples.sample_type IS '샘플 종류: writing(글쓰기 2개) / comment(댓글 3개) / reply(답글 3개)';
COMMENT ON COLUMN persona_preview_samples.generated_by IS 'system: 시딩 스크립트로 생성 / ai_preview: Pro 사용자가 실시간 생성';
COMMENT ON CONSTRAINT chk_user_persona_purpose_all ON user_personas IS '사용자 페르소나는 항상 writing/comment/reply 중 하나. all은 시스템 페르소나에서만 허용';

COMMIT;
