-- generation_queue status CHECK 제약에 publishing/saving/save_failed 추가
-- 워커에서 사용하는 상태값이 CHECK 제약에 누락되어 INSERT/UPDATE 실패

ALTER TABLE generation_queue DROP CONSTRAINT IF EXISTS generation_queue_status_check;

ALTER TABLE generation_queue ADD CONSTRAINT generation_queue_status_check
    CHECK (status IN (
        'pending',      -- 대기 중
        'processing',   -- AI 생성 중
        'publishing',   -- 네이버 발행 중
        'saving',       -- 임시저장 중
        'completed',    -- 완료
        'failed',       -- 발행 실패
        'save_failed',  -- 임시저장 실패
        'cancelled'     -- 취소됨
    ));
