import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/naver/login
 * 네이버 OAuth 인증 페이지로 리다이렉트
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "네이버 로그인이 설정되지 않았습니다" },
      { status: 500 }
    );
  }

  // Open Redirect 방지: 내부 경로만 허용
  const rawRedirect = req.nextUrl.searchParams.get("redirect") || "/calendar";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
    ? rawRedirect
    : "/calendar";
  const state = crypto.randomUUID();

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const callbackUrl = `${origin}/api/auth/naver/callback`;

  const naverAuthUrl = new URL("https://nid.naver.com/oauth2.0/authorize");
  naverAuthUrl.searchParams.set("client_id", clientId);
  naverAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  naverAuthUrl.searchParams.set("response_type", "code");
  naverAuthUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(naverAuthUrl.toString());

  const isSecure = origin.startsWith("https://");
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
  });
  res.cookies.set("oauth_redirect", redirect, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
  });

  return res;
}
