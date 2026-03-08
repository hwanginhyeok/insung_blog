-- Migration: 00002_create_generation_queue
-- Created: 2026-03-05
-- Description: 글 생성 대기열 및 작업 관리 테이블 생성

-- 생성 대기열 (Job Queue)
CREATE TABLE IF NOT EXISTS generation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- 입력 데이터
    input_photos JSONB DEFAULT '[]', -- ["url1", "url2", ...]
    input_memo TEXT,
    input_category TEXT CHECK (input_category IN ('맛집', '여행', '일상', '카페', '기타')),
    
    -- 작업 상태
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',      -- 대기 중
        'processing',   -- 처리 중
        'completed',    -- 완료
        'failed',       -- 실패
        'cancelled'     -- 취소됨
    )),
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10), -- 1: 낮음, 10: 긴급
    
    -- 처리 정보
    worker_id TEXT, -- 처리한 워커 ID
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- 결과 데이터
    generated_title TEXT,
    generated_body TEXT,
    generated_html TEXT,
    generated_hashtags JSONB DEFAULT '[]',
    
    -- 피드백 및 수정
    user_feedback TEXT, -- 사용자 피드백/수정 요청
    final_html TEXT,    -- 사용자 수정 후 최종 HTML
    
    -- 에러 및 재시도
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count <= 3),
    
    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_generation_queue_user_id ON generation_queue(user_id);
CREATE INDEX idx_generation_queue_status ON generation_queue(status);
CREATE INDEX idx_generation_queue_worker ON generation_queue(worker_id) WHERE status = 'processing';
CREATE INDEX idx_generation_queue_created ON generation_queue(created_at DESC);

-- 상태별 카운트 뷰 (대시보드용)
CREATE OR REPLACE VIEW user_queue_stats AS
SELECT 
    user_id,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(*) as total_count
FROM generation_queue
GROUP BY user_id;

-- 트리거 적용
CREATE TRIGGER update_generation_queue_updated_at
    BEFORE UPDATE ON generation_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 주석 추가
COMMENT ON TABLE generation_queue IS '글 생성 작업 대기열';
COMMENT ON COLUMN generation_queue.status IS 'pending: 대기, processing: 처리중, completed: 완료, failed: 실패, cancelled: 취소';
COMMENT ON COLUMN generation_queue.priority IS '1-10, 높을수록 우선순위 높음';
