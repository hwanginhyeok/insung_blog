"use client";

import { useEffect } from "react";

/** 글로벌 에러 바운더리 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("글로벌 에러:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-destructive">오류</h1>
        <h2 className="text-xl font-semibold text-foreground">
          문제가 발생했습니다
        </h2>
        <p className="text-muted-foreground max-w-md">
          예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
        {/* 개발 모드에서만 에러 메시지 표시 */}
        {process.env.NODE_ENV === "development" && error.message && (
          <pre className="mx-auto max-w-lg rounded-md bg-muted p-3 text-left text-xs text-muted-foreground overflow-auto">
            {error.message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            다시 시도
          </button>
          <a
            href="/write"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}
