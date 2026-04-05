"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

/** 유형 옵션 */
const TICKET_TYPES = [
  { value: "bug", label: "버그 리포트", emoji: "🐛" },
  { value: "feature", label: "기능 요청", emoji: "💡" },
  { value: "question", label: "질문", emoji: "❓" },
  { value: "other", label: "기타", emoji: "📝" },
] as const;

type TicketType = (typeof TICKET_TYPES)[number]["value"];

export function FeedbackPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // 셀렉트 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        selectRef.current &&
        !selectRef.current.contains(e.target as Node)
      ) {
        setIsSelectOpen(false);
      }
    }

    if (isSelectOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSelectOpen]);

  // ESC 키로 패널 닫기
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  /** 폼 초기화 */
  function resetForm() {
    setType("bug");
    setTitle("");
    setDescription("");
    setResult(null);
  }

  /** 티켓 제출 */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          pageUrl: window.location.href,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ ok: true, message: "문의가 접수되었습니다" });
        // 성공 시 2초 후 폼 리셋
        setTimeout(() => {
          resetForm();
        }, 2000);
      } else {
        setResult({
          ok: false,
          message: data.error || "전송에 실패했습니다",
        });
      }
    } catch {
      setResult({ ok: false, message: "네트워크 오류가 발생했습니다" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedType = TICKET_TYPES.find((t) => t.value === type)!;

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setResult(null);
        }}
        className={`fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 ${
          isOpen
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground"
        }`}
        aria-label={isOpen ? "문의 패널 닫기" : "문의하기"}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
      </button>

      {/* 슬라이드 패널 */}
      <div
        ref={panelRef}
        className={`fixed bottom-20 right-6 z-50 w-80 max-w-[calc(100vw-3rem)] transition-all duration-300 ${
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <Card className="shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              문의 / 버그 리포트
            </CardTitle>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-3">
              {/* 유형 선택 (커스텀 셀렉트) */}
              <div className="space-y-1">
                <label className="text-sm font-medium">유형</label>
                <div ref={selectRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsSelectOpen(!isSelectOpen)}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span>
                      {selectedType.emoji} {selectedType.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        isSelectOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isSelectOpen && (
                    <div className="absolute top-full left-0 z-10 mt-1 w-full rounded-md border border-input bg-background shadow-md">
                      {TICKET_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => {
                            setType(t.value);
                            setIsSelectOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                            type === t.value
                              ? "bg-accent font-medium"
                              : ""
                          }`}
                        >
                          <span>{t.emoji}</span>
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 제목 */}
              <div className="space-y-1">
                <label htmlFor="feedback-title" className="text-sm font-medium">
                  제목
                </label>
                <Input
                  id="feedback-title"
                  placeholder="간단히 요약해주세요"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              {/* 설명 */}
              <div className="space-y-1">
                <label
                  htmlFor="feedback-description"
                  className="text-sm font-medium"
                >
                  설명
                </label>
                <Textarea
                  id="feedback-description"
                  placeholder="자세히 설명해주세요..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  required
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {description.length}/2000
                </p>
              </div>

              {/* 결과 메시지 */}
              {result && (
                <p
                  className={`text-sm ${
                    result.ok ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {result.ok ? "✓" : "✗"} {result.message}
                </p>
              )}
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !title.trim() ||
                  !description.trim() ||
                  (result?.ok ?? false)
                }
                className="w-full"
                size="sm"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    전송 중...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    전송
                  </span>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}
