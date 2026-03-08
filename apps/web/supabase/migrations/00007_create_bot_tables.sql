-- Migration: 00007_create_bot_tables
-- Created: 2026-03-07
-- Description: 댓글 봇 웹 통합 (W6) — 제어 평면 테이블 3개 생성
--   - pending_comments: 승인 대기 댓글 (웹·텔레그램 공유)
--   - bot_settings: 봇 설정 (시간대, 한도, 모드)
--   - bot_run_log: 실행 이력 (상태 대시보드)

-- ============================================================
-- 1. pending_comments — 승인 대기 댓글 (웹·텔레그램 양쪽에서 관리)
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 댓글 대상 정보
    blog_id TEXT NOT NULL,
    post_url TEXT NOT NULL,
    post_title TEXT NOT NULL DEFAULT '',

    -- 댓글 내용
    comment_text TEXT NOT NULL,
    ai_generated BOOLEAN NOT NULL DEFAULT true,

    -- 상태 관리
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'posted', 'failed')),

    -- 처리 추적
    decided_at TIMESTAMPTZ,
    decided_by TEXT,              -- 'web' 또는 'telegram'
    posted_at TIMESTAMPTZ,
    fail_reason TEXT,

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pending_comments_status ON pending_comments(user_id, status);
CREATE INDEX idx_pending_comments_created ON pending_comments(created_at DESC);

-- ============================================================
-- 2. bot_settings — 봇 설정 (사용자별 1:1)
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 운영 모드
    approval_mode TEXT NOT NULL DEFAULT 'manual'
        CHECK (approval_mode IN ('manual', 'auto')),
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- 시간대 설정
    weekday_hours JSONB NOT NULL DEFAULT '{"start": 20, "end": 24}',
    weekend_hours JSONB NOT NULL DEFAULT '{"start": 13, "end": 18}',

    -- 일일 한도
    max_comments_per_day INT NOT NULL DEFAULT 30,
    max_bloggers_per_day INT NOT NULL DEFAULT 10,

    -- 메타데이터
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. bot_run_log — 실행 이력 (웹 대시보드 상태 표시)
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_run_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 실행 결과
    run_at TIMESTAMPTZ DEFAULT NOW(),
    bloggers_visited INT NOT NULL DEFAULT 0,
    comments_written INT NOT NULL DEFAULT 0,
    comments_failed INT NOT NULL DEFAULT 0,
    pending_count INT NOT NULL DEFAULT 0,

    -- 실행 메타
    error_message TEXT,
    duration_seconds INT
);

CREATE INDEX idx_bot_run_log_user ON bot_run_log(user_id, run_at DESC);

-- ============================================================
-- updated_at 자동 업데이트 트리거
-- ============================================================

CREATE TRIGGER update_bot_settings_updated_at
    BEFORE UPDATE ON bot_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE pending_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_run_log ENABLE ROW LEVEL SECURITY;

-- pending_comments: 본인 데이터만 접근
CREATE POLICY "사용자 본인 대기댓글 조회" ON pending_comments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "사용자 본인 대기댓글 수정" ON pending_comments
    FOR UPDATE USING (auth.uid() = user_id);

-- bot_settings: 본인 설정만 접근
CREATE POLICY "사용자 본인 봇설정 조회" ON bot_settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "사용자 본인 봇설정 생성" ON bot_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "사용자 본인 봇설정 수정" ON bot_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- bot_run_log: 본인 이력만 조회
CREATE POLICY "사용자 본인 실행이력 조회" ON bot_run_log
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 주석
-- ============================================================

COMMENT ON TABLE pending_comments IS '승인 대기 댓글. 웹·텔레그램 양쪽에서 승인/거부. service_role로 봇이 INSERT.';
COMMENT ON TABLE bot_settings IS '봇 설정. 사용자별 1:1. approval_mode, 시간대, 한도 관리.';
COMMENT ON TABLE bot_run_log IS '봇 실행 이력. 웹 대시보드 상태 카드 표시용.';

COMMENT ON COLUMN pending_comments.decided_by IS '처리 주체: web(웹 대시보드) 또는 telegram(텔레그램 봇)';
COMMENT ON COLUMN pending_comments.status IS '상태: pending(대기) → approved(승인)/rejected(거부) → posted(게시완료)/failed(게시실패)';
COMMENT ON COLUMN bot_settings.weekday_hours IS 'JSON: {"start": 20, "end": 24} — 평일 허용 시간대';
COMMENT ON COLUMN bot_settings.weekend_hours IS 'JSON: {"start": 13, "end": 18} — 주말 허용 시간대';
