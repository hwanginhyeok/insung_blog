import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/kakao/login
 * 카카오 OAuth 인증 페이지로 리다이렉트
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "카카오 로그인이 설정되지 않았습니다" },
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
  const callbackUrl = `${origin}/api/auth/kakao/callback`;

  const kakaoAuthUrl = new URL("https://kauth.kakao.com/oauth/authorize");
  kakaoAuthUrl.searchParams.set("client_id", clientId);
  kakaoAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  kakaoAuthUrl.searchParams.set("response_type", "code");
  kakaoAuthUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(kakaoAuthUrl.toString());

  // CSRF 방지용 state + redirect 경로를 쿠키에 저장
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  res.cookies.set("oauth_redirect", redirect, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });

  return res;
}
