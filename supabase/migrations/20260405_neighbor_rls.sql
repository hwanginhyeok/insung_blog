-- 이웃 관련 테이블 RLS 정책 설정
-- neighbors, neighbor_requests, neighbor_interactions, neighbor_recommendations

-- 1. RLS 활성화
ALTER TABLE IF EXISTS neighbors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS neighbor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS neighbor_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS neighbor_recommendations ENABLE ROW LEVEL SECURITY;

-- 2. neighbors: 본인 데이터만 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbors_user_select') THEN
    CREATE POLICY neighbors_user_select ON neighbors
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbors_user_insert') THEN
    CREATE POLICY neighbors_user_insert ON neighbors
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbors_user_update') THEN
    CREATE POLICY neighbors_user_update ON neighbors
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbors_user_delete') THEN
    CREATE POLICY neighbors_user_delete ON neighbors
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. neighbor_requests: 본인 데이터만 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_requests_user_select') THEN
    CREATE POLICY neighbor_requests_user_select ON neighbor_requests
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_requests_user_insert') THEN
    CREATE POLICY neighbor_requests_user_insert ON neighbor_requests
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_requests_user_update') THEN
    CREATE POLICY neighbor_requests_user_update ON neighbor_requests
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. neighbor_interactions: 본인 데이터만 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_interactions_user_select') THEN
    CREATE POLICY neighbor_interactions_user_select ON neighbor_interactions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_interactions_user_insert') THEN
    CREATE POLICY neighbor_interactions_user_insert ON neighbor_interactions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 5. neighbor_recommendations: 본인 데이터만 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_recommendations_user_select') THEN
    CREATE POLICY neighbor_recommendations_user_select ON neighbor_recommendations
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_recommendations_user_insert') THEN
    CREATE POLICY neighbor_recommendations_user_insert ON neighbor_recommendations
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_recommendations_user_update') THEN
    CREATE POLICY neighbor_recommendations_user_update ON neighbor_recommendations
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 6. service_role 접근 허용 (워커에서 서비스키로 접근)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbors_service_all') THEN
    CREATE POLICY neighbors_service_all ON neighbors
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_requests_service_all') THEN
    CREATE POLICY neighbor_requests_service_all ON neighbor_requests
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_interactions_service_all') THEN
    CREATE POLICY neighbor_interactions_service_all ON neighbor_interactions
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'neighbor_recommendations_service_all') THEN
    CREATE POLICY neighbor_recommendations_service_all ON neighbor_recommendations
      FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;
