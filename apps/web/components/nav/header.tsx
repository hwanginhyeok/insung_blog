"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

// 글쓰기 탭으로 묶인 경로들
const blogPaths = ["/dashboard", "/write", "/calendar", "/persona", "/analytics"];
// 소셜봇 탭으로 묶인 경로들
const socialPaths = ["/bot", "/neighbor"];

// 글쓰기 드롭다운 하위 항목
const writeSubItems = [
  { href: "/write", label: "글쓰기" },
  { href: "/calendar", label: "캘린더" },
  { href: "/dashboard", label: "내 글" },
  { href: "/persona", label: "페르소나" },
  { href: "/analytics", label: "성과분석" },
];

// 소셜봇 드롭다운 하위 항목
const socialSubItems = [
  { href: "/bot", label: "댓글봇" },
  { href: "/neighbor", label: "이웃관리" },
];

const navItems = [
  { href: "/guide", label: "사용법" },
  { href: "/pricing", label: "요금제" },
];

const adminItems = [{ href: "/admin", label: "관리" }];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [socialDropdownOpen, setSocialDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socialDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setUser(data.user);

      if (data.user) {
        const { data: profile } = await supabase
          .from("users")
          .select("role")
          .eq("id", data.user.id)
          .single();
        setIsAdmin(profile?.role === "admin");
      }
    }
    loadUser();
  }, []);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (socialDropdownRef.current && !socialDropdownRef.current.contains(e.target as Node)) {
        setSocialDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isBlogActive = blogPaths.some((p) => pathname.startsWith(p));

  function getIsActive(href: string) {
    if (href === "/bot") return socialPaths.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  }

  return (
    <header className="border-b border-primary/10 bg-primary/5">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/write" className="text-lg font-bold text-primary whitespace-nowrap" title="대시보드로">
            인성이
          </Link>
          <nav className="flex items-center gap-1">
            {/* 글쓰기 드롭다운 (상단 배치) */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((prev) => !prev)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isBlogActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/70 hover:bg-primary/10 hover:text-primary"
                )}
              >
                글쓰기
                <span className={cn(
                  "ml-1 inline-block text-[10px] transition-transform duration-200",
                  dropdownOpen ? "rotate-180" : ""
                )}>
                  ▼
                </span>
              </button>

              {/* 슬라이드 다운 드롭다운 */}
              <div
                className={cn(
                  "absolute left-0 top-full mt-1 z-50 min-w-[140px] overflow-hidden rounded-lg border bg-card shadow-lg",
                  "origin-top transition-all duration-200 ease-out",
                  dropdownOpen
                    ? "scale-y-100 opacity-100"
                    : "pointer-events-none scale-y-0 opacity-0"
                )}
              >
                <div className="py-1">
                  {writeSubItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      className={cn(
                        "block px-4 py-2 text-sm transition-colors",
                        pathname.startsWith(item.href)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* 소셜봇 드롭다운 */}
            <div className="relative" ref={socialDropdownRef}>
              <button
                onClick={() => setSocialDropdownOpen((prev) => !prev)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  socialPaths.some((p) => pathname.startsWith(p))
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/70 hover:bg-primary/10 hover:text-primary"
                )}
              >
                소셜봇
                <span className={cn(
                  "ml-1 inline-block text-[10px] transition-transform duration-200",
                  socialDropdownOpen ? "rotate-180" : ""
                )}>
                  ▼
                </span>
              </button>
              <div
                className={cn(
                  "absolute left-0 top-full mt-1 z-50 min-w-[120px] overflow-hidden rounded-lg border bg-card shadow-lg",
                  "origin-top transition-all duration-200 ease-out",
                  socialDropdownOpen
                    ? "scale-y-100 opacity-100"
                    : "pointer-events-none scale-y-0 opacity-0"
                )}
              >
                <div className="py-1">
                  {socialSubItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSocialDropdownOpen(false)}
                      className={cn(
                        "block px-4 py-2 text-sm transition-colors",
                        pathname.startsWith(item.href)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* 나머지 네비 항목 */}
            {navItems.map((item) => {
              const isActive = getIsActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/70 hover:bg-primary/10 hover:text-primary"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {isAdmin &&
              adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/70 hover:bg-primary/10 hover:text-primary"
                  )}
                >
                  {item.label}
                </Link>
              ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden sm:inline text-sm text-foreground/50">
              {user.email?.split("@")[0]}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-primary/20 text-foreground/70 hover:bg-primary/10 hover:text-primary"
          >
            로그아웃
          </Button>
        </div>
      </div>
    </header>
  );
}
