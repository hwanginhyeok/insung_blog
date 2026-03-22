-- 블로그 테마 컬럼 추가 (이웃 찾기 키워드 자동 완성용)
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS blog_themes JSONB DEFAULT '[]';
