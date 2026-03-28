"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileText,
  PenSquare,
  CalendarDays,
  User,
  BarChart3,
} from "lucide-react";

const sidebarItems = [
  { href: "/dashboard", label: "내 글", icon: FileText },
  { href: "/write", label: "새 글 쓰기", icon: PenSquare },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/persona", label: "페르소나", icon: User },
  { href: "/analytics", label: "성과 분석", icon: BarChart3 },
];

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-6xl gap-0">
      {/* 데스크탑 사이드바 */}
      <aside className="hidden w-48 shrink-0 border-r bg-muted/30 md:block">
        <nav className="sticky top-14 flex flex-col gap-0.5 px-3 py-4">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "border-l-[3px] border-l-primary bg-primary/10 pl-[9px] text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 모바일 수평 탭 */}
      <div className="flex w-full min-w-0 flex-col">
        {/* 스크롤 힌트 fade 오버레이 */}
        <div className="relative md:hidden">
          <div className="flex overflow-x-auto border-b bg-muted/30">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          {/* 오른쪽 fade — 더 탭이 있음을 암시 */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/80 to-transparent" />
        </div>

        <div className="px-4 py-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
