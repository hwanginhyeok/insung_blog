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
  // ?mode=signup 이면 기본을 회원가입으로 (랜딩 CTA → 회원가입 흐름)
  const initialMode = useSearchParams().get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

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
      // 회원가입 후 users 테이블에 레코드 생성은 DB 트리거로 처리
      // 이메일 인증이 필요할 수 있으므로 안내 메시지 표시
      setError("✓ 가입 완료! 이메일을 확인해 인증을 완료하세요.");
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

    router.push(redirect);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            <Link href="/" className="hover:opacity-80">인성이</Link>
          </CardTitle>
          <CardDescription>
            {mode === "login"
              ? "블로그 AI 파트너에 로그인"
              : "새 계정 만들기"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">이메일</label>
              <Input
                type="email"
                placeholder="이메일을 입력하세요"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">비밀번호</label>
              <Input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className={`text-sm ${error.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading
                ? mode === "login"
                  ? "로그인 중..."
                  : "가입 중..."
                : mode === "login"
                  ? "로그인"
                  : "회원가입"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  계정이 없으신가요?{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                  >
                    회원가입
                  </button>
                </>
              ) : (
                <>
                  이미 계정이 있으신가요?{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                  >
                    로그인
                  </button>
                </>
              )}
            </p>
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
              className="w-full border-0 font-medium"
              style={{ backgroundColor: "#FEE500", color: "#191919" }}
              onClick={() =>
                (window.location.href = `/api/auth/kakao/login?redirect=${encodeURIComponent(redirect)}`)
              }
            >
              카카오로 로그인
            </Button>

            <Button
              type="button"
              className="w-full border-0 font-medium text-white"
              style={{ backgroundColor: "#03C75A" }}
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
