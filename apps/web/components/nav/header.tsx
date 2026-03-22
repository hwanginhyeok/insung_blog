"use client";

import { useEffect, useState } from "react";
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

const navItems = [
  { href: "/calendar", label: "글쓰기" },
  { href: "/bot", label: "소셜봇" },
  { href: "/guide", label: "사용법" },
];

const adminItems = [{ href: "/admin", label: "관리" }];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function getIsActive(href: string) {
    if (href === "/calendar") return blogPaths.some((p) => pathname.startsWith(p));
    if (href === "/bot") return socialPaths.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  }

  return (
    <header className="border-b border-primary/10 bg-primary/5">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/calendar" className="text-lg font-bold text-primary">
            인성이
          </Link>
          <nav className="flex items-center gap-1">
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
            <span className="text-sm text-foreground/50">
              {user.email}
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
