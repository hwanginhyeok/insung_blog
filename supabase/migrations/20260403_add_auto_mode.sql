-- bot_settings에 자동 모드 컬럼 추가
-- daily_discover: 하루 한 번 자동으로 봇 실행 (댓글 수집)
-- auto_execute: 봇 실행 완료 후 자동 승인 + 게시
ALTER TABLE bot_settings
    ADD COLUMN IF NOT EXISTS daily_discover boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS auto_execute boolean DEFAULT false;
