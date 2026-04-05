-- 문의/버그 리포트 테이블
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'question', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- RLS 활성화
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- 본인 티켓만 조회 가능
CREATE POLICY "사용자 본인 티켓 조회"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id);

-- 인증된 사용자만 생성 가능
CREATE POLICY "인증 사용자 티켓 생성"
  ON support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_updated_at();
