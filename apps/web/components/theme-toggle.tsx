"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 다크모드 토글 버튼.
 * localStorage에 테마 저장, <html>에 .dark 클래스 토글.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  // hydration 불일치 방지 — 마운트 후에만 렌더링
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDark(isDark);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // 마운트 전에는 빈 버튼으로 레이아웃 확보
  if (!mounted) {
    return <div className="h-9 w-9" />;
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md",
        "border border-input bg-background shadow-sm",
        "hover:bg-accent hover:text-accent-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      )}
      title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {dark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
