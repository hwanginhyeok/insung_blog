-- Migration: 00009_drop_user_credentials
-- Created: 2026-03-08
-- Description: user_credentials 테이블 삭제
-- 사유: 제3자 자격증명(네이버 ID/PW)을 웹 플랫폼 DB에 저장하는 것은 보안 위험.
--       봇은 로컬 .env에서 자격증명을 읽으며, 웹은 제어 평면(승인/설정)만 담당.

-- 정책/트리거 삭제 (테이블 존재할 때만)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_credentials' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "credentials_select_own" ON user_credentials;
    DROP POLICY IF EXISTS "credentials_insert_own" ON user_credentials;
    DROP POLICY IF EXISTS "credentials_update_own" ON user_credentials;
    DROP TRIGGER IF EXISTS update_user_credentials_updated_at ON user_credentials;
  END IF;
END $$;

-- 테이블 삭제
DROP TABLE IF EXISTS public.user_credentials;
