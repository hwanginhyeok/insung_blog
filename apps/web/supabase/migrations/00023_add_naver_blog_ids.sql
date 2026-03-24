-- 00023: naver_blog_ids 배열 추가 (다중 블로그 ID 지원)
-- 한 사용자가 여러 네이버 블로그 ID를 보유할 수 있으므로,
-- 자기 블로그 방문 차단 시 모든 ID를 제외해야 함.
-- 기존 naver_blog_id(문자열)은 대표 ID로 유지.

ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS naver_blog_ids JSONB DEFAULT '[]'::jsonb;

-- 기존 naver_blog_id 값을 naver_blog_ids 배열에 초기 세팅
UPDATE bot_settings
SET naver_blog_ids = jsonb_build_array(naver_blog_id)
WHERE naver_blog_id IS NOT NULL
  AND (naver_blog_ids IS NULL OR naver_blog_ids = '[]'::jsonb);

COMMENT ON COLUMN bot_settings.naver_blog_ids IS '사용자의 모든 네이버 블로그 ID 목록 (자동 누적)';
