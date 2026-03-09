-- 봇 명령 큐: 웹에서 봇 실행/댓글 게시/재시도를 트리거하는 Command Queue 패턴
-- 웹 → INSERT → 로컬 워커가 10초 폴링으로 감지 → 실행 → 결과 UPDATE

CREATE TABLE bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command TEXT NOT NULL CHECK (command IN ('run', 'execute', 'retry')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 워커가 pending 명령만 조회하므로 partial index로 최적화
CREATE INDEX idx_bot_commands_pending ON bot_commands(status, created_at)
  WHERE status = 'pending';

ALTER TABLE bot_commands ENABLE ROW LEVEL SECURITY;

-- 웹 사용자는 본인 명령만 조회/생성 가능 (워커는 service_role로 RLS 우회)
CREATE POLICY "본인 명령 조회" ON bot_commands FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 명령 생성" ON bot_commands FOR INSERT WITH CHECK (auth.uid() = user_id);
