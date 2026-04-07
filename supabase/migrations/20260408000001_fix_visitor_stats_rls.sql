-- 방문자 통계 RLS 수정: 과도하게 개방된 정책 제거
-- service_role은 RLS 우회하므로 별도 정책 불필요
-- 일반 사용자는 본인 데이터만 SELECT 가능

DROP POLICY IF EXISTS "서버 사이드 방문자 통계 저장" ON blog_visitor_stats;
