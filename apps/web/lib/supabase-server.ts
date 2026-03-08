import { createServerClient as _createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트용 Supabase 클라이언트.
 * 쿠키에서 세션을 읽어 auth.uid()로 RLS 정책이 적용됨.
 */
export function createServerClient() {
  const cookieStore = cookies();
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
}
