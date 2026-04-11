import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminClient } from "@/lib/supabase-admin";
import { notifyAdmin } from "@/lib/telegram";

/**
 * GET /api/auth/naver/callback
 * 네이버 OAuth 콜백 → 토큰 교환 → 사용자 생성/연결 → 세션 생성
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

  // 2. 코드 → 토큰 교환
  const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token");
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("client_id", process.env.NAVER_CLIENT_ID!);
  tokenUrl.searchParams.set("client_secret", process.env.NAVER_CLIENT_SECRET!);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("state", state);

  const tokenRes = await fetch(tokenUrl.toString());

  if (!tokenRes.ok) {
    return loginError("네이버 토큰 교환 실패");
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return loginError(`네이버 인증 오류: ${tokenData.error_description || tokenData.error}`);
  }

  const { access_token } = tokenData;

  // 3. 사용자 정보 조회
  const userRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    return loginError("네이버 사용자 정보 조회 실패");
  }

  const userData = await userRes.json();
  const naverUser = userData.response;
  const naverId = naverUser.id;
  const email = naverUser.email || `naver_${naverId}@oauth.local`;
  const name = naverUser.name || naverUser.nickname || null;

  // 4. 사용자 찾기 또는 생성
  const admin = createAdminClient();
  let userEmail: string;

  // 4-1. naver_id로 기존 사용자 검색
  const { data: existingByNaver } = await admin
    .from("users")
    .select("id, email")
    .eq("naver_id", naverId)
    .maybeSingle();

  if (existingByNaver) {
    userEmail = existingByNaver.email;
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
        .update({ naver_id: naverId })
        .eq("id", existingByEmail.id);
      userEmail = email;
    } else {
      // 4-3. 새 사용자 생성
      const { data: newUser, error: createError } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name, provider: "naver" },
        });

      if (createError || !newUser.user) {
        return loginError("사용자 생성 실패");
      }

      // 트리거가 public.users 생성 후 naver_id 업데이트
      await admin
        .from("users")
        .update({ naver_id: naverId, ...(name && { name }) })
        .eq("id", newUser.user.id);

      userEmail = email;

      // 관리자 알림 — 신규 가입 (실패해도 로그인 흐름 영향 없음)
      notifyAdmin(
        `🎉 <b>신규 가입</b> (네이버)\n` +
          (name ? `이름: ${name}\n` : "") +
          `이메일: ${email}`
      ).catch(() => {});
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

  // 신규 사용자는 /write, 재방문은 /calendar (명시적 redirect 없을 때만)
  let finalRedirect = redirect;
  if (redirect === "/calendar") {
    const { data: onboardData } = await admin
      .from("users")
      .select("onboarding_completed")
      .eq("email", userEmail)
      .maybeSingle();
    if (onboardData && !onboardData.onboarding_completed) {
      finalRedirect = "/write";
    }
  }

  // 리다이렉트 응답 준비
  const redirectUrl = new URL(finalRedirect, req.url);
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
