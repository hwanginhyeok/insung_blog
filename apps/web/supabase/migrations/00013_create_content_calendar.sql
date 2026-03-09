-- Migration: 00013_create_content_calendar
-- Created: 2026-03-09
-- Description: 콘텐츠 캘린더 테이블 생성

CREATE TABLE IF NOT EXISTS content_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    planned_date DATE NOT NULL,
    topic TEXT NOT NULL,
    category TEXT CHECK (category IN ('맛집', '카페', '여행', '일상', '기타')),
    memo TEXT,

    status TEXT DEFAULT 'planned'
        CHECK (status IN ('planned', 'in_progress', 'published', 'cancelled')),

    -- 생성된 글과 연결 (optional)
    generation_id UUID REFERENCES generation_queue(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_content_calendar_user_date
    ON content_calendar(user_id, planned_date);
CREATE INDEX idx_content_calendar_status
    ON content_calendar(user_id, status);

-- updated_at 자동 업데이트
CREATE TRIGGER update_content_calendar_updated_at
    BEFORE UPDATE ON content_calendar
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자 본인 캘린더 조회" ON content_calendar
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "사용자 본인 캘린더 생성" ON content_calendar
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "사용자 본인 캘린더 수정" ON content_calendar
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "사용자 본인 캘린더 삭제" ON content_calendar
    FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE content_calendar IS '콘텐츠 캘린더 — 날짜별 주제 예약 + 발행 상태 추적';
COMMENT ON COLUMN content_calendar.status IS 'planned: 예정, in_progress: 작성중, published: 발행완료, cancelled: 취소';
