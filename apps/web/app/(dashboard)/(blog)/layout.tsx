"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { href: "/dashboard", label: "내 글" },
  { href: "/write", label: "새 글 쓰기" },
  { href: "/calendar", label: "캘린더" },
  { href: "/persona", label: "페르소나" },
  { href: "/analytics", label: "성과 분석" },
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
      <aside className="hidden w-44 shrink-0 border-r md:block">
        <nav className="sticky top-14 flex flex-col gap-1 px-3 py-4">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* 모바일 수평 탭 */}
      <div className="flex w-full min-w-0 flex-col">
        <div className="flex overflow-x-auto border-b md:hidden">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="px-4 py-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
