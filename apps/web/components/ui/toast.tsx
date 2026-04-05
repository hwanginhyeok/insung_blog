"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ── 타입 ──

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

// ── 컨텍스트 ──

const ToastContext = createContext<ToastContextValue | null>(null);

/** 토스트 알림을 사용하기 위한 훅 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 <Toaster /> 하위에서만 사용 가능합니다");
  return ctx;
}

// ── 스타일 맵 ──

const typeStyles: Record<ToastType, string> = {
  success:
    "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  error:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  info:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
};

// ── 토스터 컴포넌트 ──

let _counter = 0;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // 사라지는 중인 토스트 ID (fade-out 애니메이션)
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const removeToast = useCallback((id: string) => {
    // fade-out 시작
    setRemoving((prev) => new Set(prev).add(id));
    // 애니메이션 후 제거
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = `toast-${++_counter}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      // 3초 후 자동 제거
      setTimeout(() => removeToast(id), 3000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* 토스트 컨테이너 — 우측 상단 고정 */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm font-medium",
              "transition-all duration-300",
              removing.has(t.id)
                ? "translate-x-full opacity-0"
                : "animate-toast-in",
              typeStyles[t.type]
            )}
          >
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
