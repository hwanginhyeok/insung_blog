-- 블로그 방문자수 통계 테이블
-- VISITOR-TRACK: 서비스 효과 측정용 일별 방문자수 수집

CREATE TABLE IF NOT EXISTS blog_visitor_stats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  day_visitor_count int DEFAULT 0,
  total_visitor_count bigint DEFAULT 0,
  subscriber_count int DEFAULT 0,
  collected_at timestamptz DEFAULT now(),
  UNIQUE(user_id, blog_id, date)
);

-- 인덱스: 사용자별 날짜 조회
CREATE INDEX idx_visitor_stats_user_date
  ON blog_visitor_stats(user_id, date DESC);

-- RLS 활성화
ALTER TABLE blog_visitor_stats ENABLE ROW LEVEL SECURITY;

-- 사용자 본인 데이터만 조회
CREATE POLICY "사용자 본인 방문자 통계 조회"
  ON blog_visitor_stats FOR SELECT
  USING (auth.uid() = user_id);

-- service_role은 INSERT/UPDATE (서버 사이드 수집용)
CREATE POLICY "서버 사이드 방문자 통계 저장"
  ON blog_visitor_stats FOR ALL
  USING (true)
  WITH CHECK (true);
