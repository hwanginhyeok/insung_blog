-- Migration: 00014_create_post_analytics
-- Created: 2026-03-09
-- Description: 성과 분석 테이블 — 게시물 조회수/댓글수/좋아요 시계열 추적

CREATE TABLE IF NOT EXISTS post_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 게시물 식별
    post_url TEXT NOT NULL,
    post_title TEXT,

    -- 수치 데이터
    view_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,

    -- 크롤링 시점
    crawled_at TIMESTAMPTZ DEFAULT NOW(),

    -- 생성된 글과 연결 (optional)
    generation_id UUID REFERENCES generation_queue(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_post_analytics_user ON post_analytics(user_id, crawled_at DESC);
CREATE INDEX idx_post_analytics_url ON post_analytics(user_id, post_url, crawled_at DESC);

-- 최신 스냅샷 뷰 (각 URL별 최신 크롤링 결과)
CREATE OR REPLACE VIEW user_post_stats AS
SELECT DISTINCT ON (user_id, post_url)
    id, user_id, post_url, post_title,
    view_count, comment_count, like_count,
    crawled_at, generation_id
FROM post_analytics
ORDER BY user_id, post_url, crawled_at DESC;

-- RLS
ALTER TABLE post_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자 본인 분석 조회" ON post_analytics
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "사용자 본인 분석 생성" ON post_analytics
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "사용자 본인 분석 삭제" ON post_analytics
    FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE post_analytics IS '게시물 성과 분석 시계열 데이터 — 크롤링마다 스냅샷 저장';
