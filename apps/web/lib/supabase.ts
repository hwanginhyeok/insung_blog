import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

/**
 * 클라이언트 컴포넌트용 Supabase 클라이언트.
 * 로그인/로그아웃, 실시간 세션 감지에 사용.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
