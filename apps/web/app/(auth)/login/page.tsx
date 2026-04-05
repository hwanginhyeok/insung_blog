"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // 항상 로그인이 기본 (회원가입은 하단 링크로 전환)
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");

  const router = useRouter();
  const searchParams = useSearchParams();
  // Open Redirect 방지: 내부 경로만 허용
  const rawRedirect = searchParams.get("redirect") || "/calendar";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
    ? rawRedirect
    : "/calendar";

  // OAuth 콜백 에러 메시지 표시
  const oauthError = searchParams.get("error");
  const [error, setError] = useState<string | null>(oauthError);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const supabase = createClient();

    if (mode === "reset") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message);
        setIsLoading(false);
        return;
      }
      setSuccessMessage("비밀번호 재설정 링크를 이메일로 보냈습니다. 확인해주세요.");
      setMode("login");
      setIsLoading(false);
      return;
    }

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }
      setSuccessMessage("가입 완료! 이메일을 확인해 인증을 완료하세요.");
      setMode("login");
      setIsLoading(false);
      return;
    }

    // 로그인
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
      return;
    }

    // 신규 사용자는 /write, 재방문은 /calendar (명시적 redirect 없을 때만)
    let target = redirect;
    if (redirect === "/calendar") {
      try {
        const res = await fetch("/api/onboarding");
        const data = await res.json();
        if (!data.completed) target = "/write";
      } catch {}
    }
    router.push(target);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            <Link href="/" className="hover:opacity-80 inline-block py-1">인성이</Link>
          </CardTitle>
          <CardDescription>
            {mode === "login"
              ? "블로그 AI 파트너에 로그인"
              : mode === "signup"
                ? "새 계정 만들기"
                : "비밀번호 재설정"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">이메일</label>
              <Input
                id="email"
                type="email"
                placeholder="이메일을 입력하세요"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== "reset" && (
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">비밀번호</label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}

            {successMessage && (
              <p className="text-sm text-primary">{successMessage}</p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading
                ? mode === "reset"
                  ? "전송 중..."
                  : mode === "login"
                    ? "로그인 중..."
                    : "가입 중..."
                : mode === "reset"
                  ? "재설정 링크 보내기"
                  : mode === "login"
                    ? "로그인"
                    : "회원가입"}
            </Button>

            <div className="space-y-1 text-center text-sm text-muted-foreground">
              {mode === "login" && (
                <p>
                  <button
                    type="button"
                    className="font-medium text-foreground underline py-2 px-1"
                    onClick={() => { setMode("reset"); setError(null); setSuccessMessage(null); }}
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </p>
              )}
              <p className="py-1">
                {mode === "login" ? (
                  <>
                    계정이 없으신가요?{" "}
                    <button
                      type="button"
                      className="font-medium text-foreground underline py-2 px-1"
                      onClick={() => { setMode("signup"); setError(null); setSuccessMessage(null); }}
                    >
                      회원가입
                    </button>
                  </>
                ) : (
                  <>
                    {mode === "reset" ? "비밀번호가 기억나셨나요?" : "이미 계정이 있으신가요?"}{" "}
                    <button
                      type="button"
                      className="font-medium text-foreground underline py-2 px-1"
                      onClick={() => { setMode("login"); setError(null); setSuccessMessage(null); }}
                    >
                      로그인
                    </button>
                  </>
                )}
              </p>
            </div>
          </form>

          {/* 소셜 로그인 */}
          <div className="mt-6 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">또는</span>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full border-0 font-medium bg-[#FEE500] text-[#191919] hover:bg-[#FDD800]"
              onClick={() =>
                (window.location.href = `/api/auth/kakao/login?redirect=${encodeURIComponent(redirect)}`)
              }
            >
              카카오로 로그인
            </Button>

            <Button
              type="button"
              size="lg"
              className="w-full border-0 font-medium text-white bg-[#03C75A] hover:bg-[#02b350]"
              onClick={() =>
                (window.location.href = `/api/auth/naver/login?redirect=${encodeURIComponent(redirect)}`)
              }
            >
              네이버로 로그인
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
