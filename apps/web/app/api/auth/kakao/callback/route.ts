import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/auth/kakao/callback
 * 카카오 OAuth 콜백 → 토큰 교환 → 사용자 생성/연결 → 세션 생성
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;
  // Open Redirect 방지: 내부 경로만 허용
  const rawRedirect = req.cookies.get("oauth_redirect")?.value || "/calendar";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
    ? rawRedirect
    : "/calendar";

  const loginError = (msg: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, req.url)
    );

  // 1. State 검증
  if (!code || !state || state !== storedState) {
    return loginError("인증 상태가 유효하지 않습니다");
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const callbackUrl = `${origin}/api/auth/kakao/callback`;

  // 2. 코드 → 토큰 교환
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_CLIENT_ID!,
      ...(process.env.KAKAO_CLIENT_SECRET && {
        client_secret: process.env.KAKAO_CLIENT_SECRET,
      }),
      code,
      redirect_uri: callbackUrl,
    }),
  });

  if (!tokenRes.ok) {
    return loginError("카카오 토큰 교환 실패");
  }

  const { access_token } = await tokenRes.json();

  // 3. 사용자 정보 조회
  const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    return loginError("카카오 사용자 정보 조회 실패");
  }

  const kakaoUser = await userRes.json();
  const kakaoId = String(kakaoUser.id);
  const email =
    kakaoUser.kakao_account?.email || `kakao_${kakaoId}@oauth.local`;
  const name = kakaoUser.kakao_account?.profile?.nickname || null;

  // 4. 사용자 찾기 또는 생성
  const admin = createAdminClient();
  let userEmail: string;

  // 4-1. kakao_id로 기존 사용자 검색
  const { data: existingByKakao } = await admin
    .from("users")
    .select("id, email")
    .eq("kakao_id", kakaoId)
    .maybeSingle();

  if (existingByKakao) {
    userEmail = existingByKakao.email;
  } else {
    // 4-2. 이메일로 기존 사용자 검색 → 계정 연결
    const { data: existingByEmail } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingByEmail) {
      await admin
        .from("users")
        .update({ kakao_id: kakaoId })
        .eq("id", existingByEmail.id);
      userEmail = email;
    } else {
      // 4-3. 새 사용자 생성
      const { data: newUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name, provider: "kakao" },
        });

      if (createError || !newUser.user) {
        return loginError("사용자 생성 실패");
      }

      // 트리거가 public.users 생성 후 kakao_id 업데이트
      await admin
        .from("users")
        .update({ kakao_id: kakaoId, ...(name && { name }) })
        .eq("id", newUser.user.id);

      userEmail = email;
    }
  }

  // 5. Magic link 생성 → 서버 측 OTP 검증으로 세션 생성
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });

  if (linkError || !linkData) {
    return loginError("세션 생성 실패");
  }

  const tokenHash = linkData.properties.hashed_token;

  // 리다이렉트 응답 준비
  const redirectUrl = new URL(redirect, req.url);
  const res = NextResponse.redirect(redirectUrl);

  // OAuth 쿠키 정리
  res.cookies.delete("oauth_state");
  res.cookies.delete("oauth_redirect");

  // Supabase 세션 쿠키 설정
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (verifyError) {
    return loginError("인증 검증 실패");
  }

  return res;
}
