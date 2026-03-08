-- Migration: 00005_add_source_column
-- Created: 2026-03-06
-- Description: generation_queue에 source 컬럼 추가 (web/telegram 구분)

ALTER TABLE generation_queue
ADD COLUMN source TEXT DEFAULT 'web' CHECK (source IN ('web', 'telegram'));

COMMENT ON COLUMN generation_queue.source IS '생성 채널: web(웹 플랫폼), telegram(텔레그램 봇)';

-- 기존 행은 모두 web으로 설정됨 (DEFAULT)
