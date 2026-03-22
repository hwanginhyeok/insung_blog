"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MessageCircle, Users } from "lucide-react";

const sidebarItems = [
  { href: "/bot", label: "댓글봇", icon: MessageCircle },
  { href: "/neighbor", label: "이웃봇", icon: Users },
];

export default function SocialLayout({
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
        <div className="flex overflow-x-auto border-b bg-muted/30 md:hidden">
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

        <div className="px-4 py-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
