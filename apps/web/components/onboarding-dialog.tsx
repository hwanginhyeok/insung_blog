"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * 온보딩 다이얼로그 — 신규 유저 첫 방문 시 3단계 안내
 *
 * 1단계: AI 글쓰기 안내 (쿠키 없이도 사용 가능)
 * 2단계: 댓글봇 안내 (쿠키 필요)
 * 3단계: 완료 + CTA
 */

interface Step {
  title: string;
  description: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    title: "AI 글쓰기",
    description:
      "사진과 메모만 올리면 당신만의 스타일로 블로그 글을 작성해드려요. 바로 시작할 수 있습니다!",
    icon: "✍️",
  },
  {
    title: "댓글봇 & 이웃관리",
    description:
      "네이버 쿠키를 등록하면 AI가 이웃 블로그에 댓글을 달고, 서로이웃도 자동 관리해줘요. 월 무료 한도 내에서 이용 가능합니다.",
    icon: "🤖",
  },
  {
    title: "준비 완료!",
    description:
      "AI 글쓰기부터 시작해보세요. 궁금한 점은 '사용법' 메뉴에서 확인할 수 있어요.",
    icon: "🎉",
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 온보딩 완료 여부 확인
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (!data.completed) {
          setOpen(true);
        }
      })
      .catch(() => {
        // 실패 시 표시하지 않음 (기존 유저 보호)
      })
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
      // 저장 실패해도 다이얼로그는 닫힘 (다음 방문 시 다시 표시)
    }
  };

  if (loading) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">{current.icon}</span>
            {current.title}
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        {/* 단계 표시 */}
        <div className="flex justify-center gap-2 py-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i === step ? "bg-emerald-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={handleComplete}>
            건너뛰기
          </Button>
          <Button onClick={handleNext}>
            {isLast ? "시작하기" : "다음"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
