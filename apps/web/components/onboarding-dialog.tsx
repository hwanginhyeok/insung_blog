"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 온보딩 오버레이 — 신규 유저 첫 방문 시 3단계 안내
 *
 * Dialog 대신 Card + overlay 패턴 사용 (shadcn/ui dialog 미설치)
 */

interface Step {
  title: string;
  description: string;
  stepLabel: string;
}

const STEPS: Step[] = [
  {
    title: "AI 글쓰기",
    description:
      "사진과 메모만 올리면 당신만의 스타일로 블로그 글을 작성해드려요. 쿠키 등록 없이 바로 시작할 수 있습니다.",
    stepLabel: "1",
  },
  {
    title: "댓글봇 & 이웃관리",
    description:
      "네이버 쿠키를 등록하면 AI가 이웃 블로그에 댓글을 달고, 서로이웃도 자동 관리합니다. 쿠키는 암호화되어 안전하게 보관됩니다.",
    stepLabel: "2",
  },
  {
    title: "준비 완료",
    description:
      "왼쪽 메뉴에서 '글쓰기'를 눌러 첫 글을 만들어보세요. 사용법은 상단 메뉴에서 확인할 수 있습니다.",
    stepLabel: "3",
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (!data.completed) {
          setOpen(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setOpen(false);
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch {
      // 저장 실패해도 닫힘 (다음 방문 시 다시 표시)
    }
  };

  if (loading || !open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold flex items-center justify-center">
              {current.stepLabel}
            </span>
            {current.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base text-gray-600 leading-relaxed">
            {current.description}
          </p>

          {/* 단계 표시 */}
          <div className="flex justify-center gap-2 py-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i === step ? "bg-emerald-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={handleComplete}>
              건너뛰기
            </Button>
            <Button onClick={handleNext}>
              {isLast ? "시작하기" : "다음"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
