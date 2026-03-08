import { createClient } from "@supabase/supabase-js";

/**
 * 관리자 전용 Supabase 클라이언트 (service_role).
 * RLS를 완전히 우회하므로 사용자 요청 처리에 절대 사용 금지.
 * 용도: DB 트리거 대체, 배치 작업, 관리자 대시보드.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
