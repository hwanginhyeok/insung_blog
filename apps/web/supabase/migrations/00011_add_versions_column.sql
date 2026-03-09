-- 글 히스토리 (버전 관리)
-- generation_queue에 versions JSONB 컬럼 추가
-- 구조: [{ version: 1, title, body, hashtags, feedback, created_at }, ...]
ALTER TABLE generation_queue
ADD COLUMN IF NOT EXISTS versions jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN generation_queue.versions IS '재생성 히스토리. [{version, title, body, hashtags, feedback, created_at}]';
