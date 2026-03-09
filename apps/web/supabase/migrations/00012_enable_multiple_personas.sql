-- Migration: 00012_enable_multiple_personas
-- Created: 2026-03-09
-- Description: 다중 페르소나 지원
--   - user_personas의 user_id UNIQUE 제약 제거 (1:N 관계)
--   - is_default 컬럼 추가 (기본 페르소나 지정)
--   - partial unique index로 기본 페르소나 1개만 허용

-- 1. UNIQUE 제약 제거 (1:1 → 1:N)
ALTER TABLE user_personas DROP CONSTRAINT IF EXISTS user_personas_user_id_key;

-- 2. is_default 컬럼 추가
ALTER TABLE user_personas ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- 3. 기존 페르소나를 기본으로 설정 (데이터 마이그레이션)
UPDATE user_personas SET is_default = true
WHERE id IN (
    SELECT DISTINCT ON (user_id) id
    FROM user_personas
    ORDER BY user_id, created_at ASC
);

-- 4. 기본 페르소나 1개만 허용하는 partial unique index
CREATE UNIQUE INDEX idx_user_personas_default
    ON user_personas(user_id)
    WHERE is_default = true;

-- 5. 사용자별 페르소나 목록 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_user_personas_user_id
    ON user_personas(user_id, created_at DESC);

COMMENT ON COLUMN user_personas.is_default IS '기본 페르소나 여부. 사용자당 1개만 true 허용 (partial unique index)';
