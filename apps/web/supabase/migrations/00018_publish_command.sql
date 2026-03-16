-- bot_commands 테이블에 publish 명령 지원 추가
-- 1) command CHECK 제약 확장: 'publish' 추가
-- 2) payload JSONB 컬럼 추가: publish 시 title/body/hashtags/image_paths 전달

-- CHECK 제약 교체 (ALTER CONSTRAINT는 지원 안 되므로 DROP + ADD)
ALTER TABLE bot_commands DROP CONSTRAINT IF EXISTS bot_commands_command_check;
ALTER TABLE bot_commands ADD CONSTRAINT bot_commands_command_check
  CHECK (command IN ('run', 'execute', 'retry', 'publish'));

-- 명령 페이로드 (publish 시 title, body, hashtags, image_paths, queue_id 등)
ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS payload JSONB;
