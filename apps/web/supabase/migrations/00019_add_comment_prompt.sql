-- 사용자별 댓글 스타일 프롬프트 커스텀
-- NULL이면 시스템 기본 프롬프트(_BASE_RULES) 사용

ALTER TABLE bot_settings
ADD COLUMN comment_prompt TEXT DEFAULT NULL;

COMMENT ON COLUMN bot_settings.comment_prompt
IS 'Custom comment style rules. NULL = use system default (_BASE_RULES).';
