"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  text: string;
}

/**
 * (?) 아이콘 클릭 시 팝오버 툴팁을 표시하는 컴포넌트.
 * 외부 클릭으로 닫힌다.
 */
export function HelpTooltip({ text }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="도움말"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-l border-t bg-popover" />
          <p className="relative leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}
