-- 다중 사용자 지원: bot_settings에 naver_blog_id 컬럼 추가
-- 각 사용자가 자신의 네이버 블로그 ID를 설정할 수 있게 함

ALTER TABLE bot_settings ADD COLUMN naver_blog_id TEXT;

-- 기존 admin 사용자에게 현재 .env 값 설정
UPDATE bot_settings SET naver_blog_id = 'youyoubear0517'
WHERE user_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1);
