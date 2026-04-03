"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase가 URL 해시에서 자동으로 세션을 복구할 때까지 대기
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    setError("✓ 비밀번호가 변경되었습니다. 로그인 페이지로 이동합니다.");
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            <Link href="/" className="hover:opacity-80">인성이</Link>
          </CardTitle>
          <CardDescription>새 비밀번호 설정</CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">
              인증 확인 중... 이메일의 링크를 통해 접속하세요.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">새 비밀번호</label>
                <Input
                  type="password"
                  placeholder="새 비밀번호 입력"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">비밀번호 확인</label>
                <Input
                  type="password"
                  placeholder="비밀번호 다시 입력"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <p className={`text-sm ${error.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
