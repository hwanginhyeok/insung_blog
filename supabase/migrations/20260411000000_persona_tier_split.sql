-- Migration: persona_tier_split
-- Created: 2026-04-11
-- Description: 페르소나 티어 분리 + 용도별 3분할 지원
--   - user_personas: purpose/is_system/locked 컬럼 + user_id NULLABLE (시스템 페르소나 지원)
--   - bot_settings: active_{writing,comment,reply}_persona_id 3슬롯 추가
--   - RLS 정책: 시스템 페르소나는 모든 인증 사용자 SELECT 허용
--   - 기존 데이터: purpose='all' 기본값 + is_default 페르소나를 3슬롯에 자동 연결
--
-- 플랜: docs/프로젝트/plans/persona-tier-split.md

BEGIN;

-- ============================================================
-- 1. user_personas 스키마 확장
-- ============================================================

-- 1-1. user_id NULLABLE (시스템 페르소나는 소유자 없음)
ALTER TABLE user_personas ALTER COLUMN user_id DROP NOT NULL;

-- 1-2. purpose 컬럼 (writing/comment/reply/all)
--      'all' = Free/Basic의 통짜 페르소나 (3용도 공유)
--      'writing'/'comment'/'reply' = Pro의 용도별 분리
ALTER TABLE user_personas
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'all'
        CHECK (purpose IN ('writing', 'comment', 'reply', 'all'));

-- 1-3. is_system 컬럼 (시스템 기본 페르소나 플래그)
ALTER TABLE user_personas
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- 1-4. locked 컬럼 (티어 다운그레이드로 잠긴 페르소나)
ALTER TABLE user_personas
    ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

-- 1-5. category 컬럼 (맛집/카페/여행/일상/리뷰 — 시스템 페르소나 분류용)
--      사용자 페르소나는 NULL 허용
ALTER TABLE user_personas
    ADD COLUMN IF NOT EXISTS category TEXT;

-- 1-6. 시스템 페르소나 무결성: is_system=true이면 user_id는 반드시 NULL
ALTER TABLE user_personas
    ADD CONSTRAINT chk_system_persona_no_user
    CHECK (
        (is_system = TRUE AND user_id IS NULL)
        OR (is_system = FALSE AND user_id IS NOT NULL)
    );

-- 1-7. 인덱스
CREATE INDEX IF NOT EXISTS idx_user_personas_system
    ON user_personas (is_system, category) WHERE is_system = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_personas_purpose
    ON user_personas (user_id, purpose) WHERE user_id IS NOT NULL;

-- ============================================================
-- 2. bot_settings에 용도별 활성 페르소나 슬롯 추가
-- ============================================================

ALTER TABLE bot_settings
    ADD COLUMN IF NOT EXISTS active_writing_persona_id UUID REFERENCES user_personas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS active_comment_persona_id UUID REFERENCES user_personas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS active_reply_persona_id   UUID REFERENCES user_personas(id) ON DELETE SET NULL;

COMMENT ON COLUMN bot_settings.active_writing_persona_id IS '글쓰기 활성 페르소나. Pro는 독립 지정, Basic/Free는 3슬롯 동일';
COMMENT ON COLUMN bot_settings.active_comment_persona_id IS '댓글 활성 페르소나';
COMMENT ON COLUMN bot_settings.active_reply_persona_id   IS '대댓글(답글) 활성 페르소나';

-- ============================================================
-- 3. RLS 정책 확장 — 시스템 페르소나는 모든 인증 사용자에게 읽기 허용
-- ============================================================

-- 기존 SELECT 정책 삭제 후 재생성 (본인 페르소나 + 시스템 페르소나)
DROP POLICY IF EXISTS "사용자 본인 페르소나 조회" ON user_personas;
DROP POLICY IF EXISTS "persona_select_own_or_system" ON user_personas;

CREATE POLICY "persona_select_own_or_system" ON user_personas
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR (is_system = TRUE AND auth.uid() IS NOT NULL)
    );

-- INSERT는 본인 페르소나만 (시스템 페르소나는 admin client로만 시딩)
DROP POLICY IF EXISTS "사용자 본인 페르소나 생성" ON user_personas;
DROP POLICY IF EXISTS "persona_insert_own" ON user_personas;

CREATE POLICY "persona_insert_own" ON user_personas
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND is_system = FALSE
    );

-- UPDATE는 본인 페르소나 + locked=false
DROP POLICY IF EXISTS "사용자 본인 페르소나 수정" ON user_personas;
DROP POLICY IF EXISTS "persona_update_own_unlocked" ON user_personas;

CREATE POLICY "persona_update_own_unlocked" ON user_personas
    FOR UPDATE
    USING (
        user_id = auth.uid() AND is_system = FALSE AND locked = FALSE
    );

-- DELETE는 본인 페르소나만 (기존에 없었음 → 추가)
DROP POLICY IF EXISTS "persona_delete_own" ON user_personas;

CREATE POLICY "persona_delete_own" ON user_personas
    FOR DELETE
    USING (
        user_id = auth.uid() AND is_system = FALSE
    );

-- ============================================================
-- 4. persona_items RLS 확장 — 시스템 페르소나의 항목도 읽기 허용
-- ============================================================

DROP POLICY IF EXISTS "사용자 본인 항목 조회" ON persona_items;
DROP POLICY IF EXISTS "persona_items_select_own_or_system" ON persona_items;

CREATE POLICY "persona_items_select_own_or_system" ON persona_items
    FOR SELECT
    USING (
        persona_id IN (
            SELECT id FROM user_personas
            WHERE user_id = auth.uid() OR is_system = TRUE
        )
    );

-- ============================================================
-- 5. 기존 데이터 마이그레이션
-- ============================================================

-- 5-1. 기존 사용자 페르소나는 모두 purpose='all' (DEFAULT로 처리됨 → 명시)
UPDATE user_personas
SET purpose = 'all'
WHERE purpose IS NULL OR purpose = 'all';

-- 5-2. 기존 is_default 페르소나를 bot_settings의 3슬롯에 자동 연결
--      (기존 사용자 동작 보존: writing/comment/reply가 모두 동일한 기본 페르소나를 가리킴)
UPDATE bot_settings bs
SET
    active_writing_persona_id = up.id,
    active_comment_persona_id = up.id,
    active_reply_persona_id   = up.id
FROM user_personas up
WHERE up.user_id = bs.user_id
  AND up.is_default = TRUE
  AND bs.active_writing_persona_id IS NULL;

-- ============================================================
-- 6. 코멘트
-- ============================================================

COMMENT ON COLUMN user_personas.purpose IS '용도: writing(글쓰기)/comment(댓글)/reply(대댓글)/all(전부공유). Basic/Free는 all, Pro는 분리 가능';
COMMENT ON COLUMN user_personas.is_system IS '시스템 기본 페르소나 여부. TRUE면 user_id는 NULL이며 모든 사용자에게 읽기 허용';
COMMENT ON COLUMN user_personas.locked IS '티어 다운그레이드로 잠긴 페르소나. TRUE면 편집/활성화 불가, 재업그레이드 시 복구';
COMMENT ON COLUMN user_personas.category IS '블로그 카테고리: 맛집/카페/여행/일상/리뷰. 시스템 페르소나 분류용, 사용자 페르소나는 NULL 허용';

COMMIT;
