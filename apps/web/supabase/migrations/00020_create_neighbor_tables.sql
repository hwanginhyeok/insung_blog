-- 서로이웃 관리 테이블 (Phase B)

-- 이웃 목록
CREATE TABLE IF NOT EXISTS neighbors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  blog_id TEXT NOT NULL,
  blog_name TEXT,
  neighbor_type TEXT CHECK (neighbor_type IN ('mutual', 'one_way_following', 'one_way_follower')),
  category TEXT,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, blog_id)
);

-- 서로이웃 신청 이력
CREATE TABLE IF NOT EXISTS neighbor_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  target_blog_id TEXT NOT NULL,
  target_blog_name TEXT,
  status TEXT CHECK (status IN ('sent', 'accepted', 'rejected', 'cancelled')) DEFAULT 'sent',
  message TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- 이웃 간 교류 기록
CREATE TABLE IF NOT EXISTS neighbor_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  blog_id TEXT NOT NULL,
  interaction_type TEXT CHECK (interaction_type IN ('comment_sent', 'comment_received', 'visit')),
  post_url TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 이웃 추천
CREATE TABLE IF NOT EXISTS neighbor_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  blog_id TEXT NOT NULL,
  blog_name TEXT,
  category TEXT,
  reason TEXT,
  score FLOAT,
  status TEXT CHECK (status IN ('pending', 'applied', 'dismissed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 정책
ALTER TABLE neighbors ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbor_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbor_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "neighbors_user_access" ON neighbors
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "neighbor_requests_user_access" ON neighbor_requests
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "neighbor_interactions_user_access" ON neighbor_interactions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "neighbor_recommendations_user_access" ON neighbor_recommendations
  FOR ALL USING (user_id = auth.uid());

-- 인덱스
CREATE INDEX idx_neighbors_user_id ON neighbors(user_id);
CREATE INDEX idx_neighbor_requests_user_id ON neighbor_requests(user_id);
CREATE INDEX idx_neighbor_interactions_user_id ON neighbor_interactions(user_id);
CREATE INDEX idx_neighbor_interactions_blog_id ON neighbor_interactions(user_id, blog_id);
CREATE INDEX idx_neighbor_recommendations_user_id ON neighbor_recommendations(user_id);
