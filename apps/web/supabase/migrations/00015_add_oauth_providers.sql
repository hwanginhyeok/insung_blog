-- Migration: 00015_add_oauth_providers
-- Created: 2026-03-09
-- Description: OAuth 소셜 로그인을 위한 카카오/네이버 ID 컬럼 추가

-- 카카오 ID
ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_id TEXT;

-- 네이버 ID
ALTER TABLE users ADD COLUMN IF NOT EXISTS naver_id TEXT;

-- 부분 유니크 인덱스 (NULL 제외 — 대부분의 사용자는 OAuth 미사용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_id
    ON users(kakao_id) WHERE kakao_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_naver_id
    ON users(naver_id) WHERE naver_id IS NOT NULL;

COMMENT ON COLUMN users.kakao_id IS '카카오 OAuth 사용자 고유 ID';
COMMENT ON COLUMN users.naver_id IS '네이버 OAuth 사용자 고유 ID';
