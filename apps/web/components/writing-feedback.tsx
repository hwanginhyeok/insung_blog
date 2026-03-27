"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * AI 글 생성 후 인앱 피드백 수집
 *
 * 1문항: "이 글을 다시 쓰시겠습니까?"
 * 선택적: 개선 의견 텍스트
 */
interface WritingFeedbackProps {
  generationId?: string;
  onClose: () => void;
}

export function WritingFeedback({ generationId, onClose }: WritingFeedbackProps) {
  const [submitted, setSubmitted] = useState(false);
  const [showText, setShowText] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (wouldUseAgain: boolean) => {
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          wouldUseAgain,
          feedbackText: feedbackText || undefined,
        }),
      });
    } catch {
      // 피드백 실패는 무시 (비핵심)
    }
    setSubmitted(true);
    setSending(false);
    setTimeout(onClose, 1500);
  };

  if (submitted) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="py-4 text-center text-emerald-700">
          감사합니다! 피드백이 반영됩니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          이 글을 다시 쓰시겠습니까?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showText && (
          <Textarea
            placeholder="어떤 점을 개선하면 좋을까요? (선택)"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            maxLength={500}
            rows={2}
          />
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => handleSubmit(true)}
            disabled={sending}
            size="sm"
            className="flex-1"
          >
            네, 만족해요
          </Button>
          <Button
            onClick={() => {
              if (!showText) {
                setShowText(true);
              } else {
                handleSubmit(false);
              }
            }}
            disabled={sending}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            {showText ? "의견 보내기" : "아쉬워요"}
          </Button>
        </div>

        {!showText && (
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 w-full text-center"
          >
            나중에
          </button>
        )}
      </CardContent>
    </Card>
  );
}
