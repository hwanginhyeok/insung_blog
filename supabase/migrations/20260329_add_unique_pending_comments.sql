-- 중복 댓글 방지 UNIQUE 제약 추가
-- 실행 전 반드시 tools/fix_duplicate_comments.py로 기존 중복 정리 완료할 것
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 수동 실행
-- 또는: supabase db push (Supabase CLI)

-- 1. 혹시 남은 중복 확인 (실행 전 점검용)
-- SELECT post_url, user_id, COUNT(*) AS cnt
-- FROM pending_comments
-- WHERE status IN ('pending', 'approved', 'posted')
-- GROUP BY post_url, user_id
-- HAVING COUNT(*) > 1;

-- 2. UNIQUE 제약 추가
-- 주의: 전체 행에 대한 UNIQUE가 아닌, 활성 상태만 대상으로 하는 partial unique index 사용
-- rejected/failed 상태는 동일 post_url 허용 (재시도 가능하도록)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_comments_active_unique
ON pending_comments (post_url, user_id)
WHERE status IN ('pending', 'approved', 'posted');
