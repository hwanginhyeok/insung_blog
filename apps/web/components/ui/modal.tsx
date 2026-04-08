"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

/**
 * 공통 모달 — body 스크롤 잠금 + ESC 닫기 + 포커스 트래핑 + ARIA
 */
export function Modal({ open, onClose, children, maxWidth = "max-w-lg" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // body 스크롤 잠금
    document.body.style.overflow = "hidden";

    // ESC 키 닫기
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);

    // 포커스 트래핑: 모달 열리면 패널에 포커스
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} mx-4 max-h-[85vh] overflow-y-auto rounded-lg bg-background p-6 shadow-xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
}

export function ModalHeader({ title, subtitle, icon, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground text-xl leading-none p-2 -m-2"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}

interface ModalFooterProps {
  children: React.ReactNode;
}

export function ModalFooter({ children }: ModalFooterProps) {
  return (
    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
      {children}
    </div>
  );
}
