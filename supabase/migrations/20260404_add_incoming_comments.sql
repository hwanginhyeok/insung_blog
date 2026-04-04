-- 내 블로그에 달린 방문자 댓글 추적 테이블
-- 대댓글(답글) 자동 생성 기능용
CREATE TABLE IF NOT EXISTS incoming_comments (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    post_url        TEXT NOT NULL,
    post_title      TEXT NOT NULL DEFAULT '',
    log_no          TEXT NOT NULL,
    comment_no      TEXT NOT NULL,           -- 네이버 댓글 고유번호 (data-param)
    commenter_id    TEXT NOT NULL,           -- 댓글 작성자 blogId
    commenter_name  TEXT NOT NULL DEFAULT '',
    comment_text    TEXT NOT NULL DEFAULT '',
    comment_date    TIMESTAMPTZ,
    reply_status    TEXT NOT NULL DEFAULT 'pending',  -- pending / generated / posted / skipped
    reply_text      TEXT,
    replied_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, comment_no)
);

ALTER TABLE incoming_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_incoming_comments_user_status
    ON incoming_comments (user_id, reply_status);
CREATE INDEX idx_incoming_comments_user_post
    ON incoming_comments (user_id, log_no);

-- RLS 정책: 자기 데이터만 접근
CREATE POLICY "incoming_comments_select" ON incoming_comments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "incoming_comments_insert" ON incoming_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "incoming_comments_update" ON incoming_comments
    FOR UPDATE USING (auth.uid() = user_id);
