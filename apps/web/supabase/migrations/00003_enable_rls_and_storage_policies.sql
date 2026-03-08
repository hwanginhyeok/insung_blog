-- Migration: 00003_enable_rls_and_storage_policies
-- Created: 2026-03-06
-- Description: RLS 활성화 + 테이블/스토리지 보안 정책

-- ============================================================
-- 1. RLS 활성화
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. users 테이블 정책
--    users.id = auth.uid() 전제 (회원가입 시 auth UID를 users.id로 사용)
-- ============================================================

-- 본인 레코드 조회
CREATE POLICY "users_select_own"
    ON users FOR SELECT
    USING (id = auth.uid());

-- 본인 레코드 수정
CREATE POLICY "users_update_own"
    ON users FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 회원가입 시 삽입 (auth.uid()와 일치하는 id만)
CREATE POLICY "users_insert_own"
    ON users FOR INSERT
    WITH CHECK (id = auth.uid());

-- ============================================================
-- 3. user_credentials 테이블 정책
-- ============================================================

-- 본인 인증정보만 조회
CREATE POLICY "credentials_select_own"
    ON user_credentials FOR SELECT
    USING (user_id = auth.uid());

-- 본인 인증정보만 삽입
CREATE POLICY "credentials_insert_own"
    ON user_credentials FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 본인 인증정보만 수정
CREATE POLICY "credentials_update_own"
    ON user_credentials FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. generation_queue 테이블 정책
-- ============================================================

-- 본인 작업만 조회
CREATE POLICY "queue_select_own"
    ON generation_queue FOR SELECT
    USING (user_id = auth.uid());

-- 본인 작업 생성
CREATE POLICY "queue_insert_own"
    ON generation_queue FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 본인 작업만 수정 (피드백, 취소 등)
CREATE POLICY "queue_update_own"
    ON generation_queue FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 5. Storage: photos 버킷 정책
--    경로 규칙: photos/{user_id}/{timestamp}_{filename}
-- ============================================================

-- 인증 사용자: 본인 폴더에 업로드
CREATE POLICY "photos_insert_own"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 인증 사용자: 본인 폴더 파일 조회
CREATE POLICY "photos_select_own"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 인증 사용자: 본인 폴더 파일 삭제
CREATE POLICY "photos_delete_own"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
