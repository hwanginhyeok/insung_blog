-- bot_settings에 proxy_url 컬럼 추가
-- 사용자별 프록시 URL 설정 (NULL이면 직접 연결)
-- 형식: "http://user:pass@host:port" 또는 "socks5://host:port"
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS proxy_url TEXT DEFAULT NULL;

COMMENT ON COLUMN bot_settings.proxy_url IS '사용자별 프록시 URL (NULL=직접 연결)';
