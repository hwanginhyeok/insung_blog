import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 미들웨어: 모든 요청에서 Supabase 세션을 갱신하고,
 * 비로그인 사용자를 보호 경로에서 차단.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          const isSecure = req.nextUrl.protocol === "https:";
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts = { ...options, secure: isSecure };
            req.cookies.set(name, value);
            res.cookies.set(name, value, opts);
          });
        },
      },
    }
  );

  // 서버사이드 JWT 검증 (getSession은 쿠키만 읽어 위변조 가능)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  // 보호 경로: /dashboard, /write, /persona, /bot, /admin
  const protectedPaths = ["/dashboard", "/write", "/calendar", "/persona", "/bot", "/admin", "/analytics"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 이미 로그인된 사용자가 /login 접근 시 대시보드로
  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/calendar", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/write/:path*", "/calendar/:path*", "/persona/:path*", "/bot/:path*", "/admin/:path*", "/analytics/:path*", "/login"],
};
