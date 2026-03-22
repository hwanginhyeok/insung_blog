"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown } from "lucide-react";
import {
  CookieStatus,
  timeAgo,
  apiFetchCookieStatus,
  apiUploadCookies,
} from "../_lib/bot-api";

interface CookieStatusBadgeProps {
  cookieStatus: CookieStatus | null;
  onStatusChange: (status: CookieStatus) => void;
  onBlogIdDetected?: (blogId: string) => void;
  onSettingsRefresh?: () => Promise<void>;
}

export function CookieStatusBadge({
  cookieStatus,
  onStatusChange,
  onBlogIdDetected,
  onSettingsRefresh,
}: CookieStatusBadgeProps) {
  // 쿠키 없으면 기본 열림, 있으면 기본 닫힘
  const [cookieOpen, setCookieOpen] = useState(!cookieStatus?.hasCookies);
  const [cookieJson, setCookieJson] = useState("");
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleCookieUpload() {
    setCookieUploading(true);
    setCookieMsg(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cookieJson);
    } catch {
      setCookieMsg({ type: "err", text: "JSON 형식이 올바르지 않습니다" });
      setCookieUploading(false);
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      setCookieMsg({ type: "err", text: "쿠키 배열이 비어있습니다" });
      setCookieUploading(false);
      return;
    }

    try {
      const result = await apiUploadCookies(parsed);
      if (result.success) {
        setCookieMsg({
          type: "ok",
          text: `${result.cookieCount}개 쿠키 업로드 완료 — 블로그 ID 자동 감지 중...`,
        });
        setCookieJson("");

        // 상태 새로고침
        try {
          const refreshed = await apiFetchCookieStatus();
          onStatusChange(refreshed);
        } catch {
          // 새로고침 실패 무시
        }

        // 15초 후 settings 재로딩 (extract_blog_id 워커 처리 대기)
        setTimeout(async () => {
          try {
            if (onSettingsRefresh) {
              await onSettingsRefresh();
            }
            // blog ID 감지 메시지는 page.tsx에서 처리
            if (onBlogIdDetected) {
              // 이 시점에는 page.tsx의 settings 상태가 갱신되어 있음
              // onBlogIdDetected 콜백은 page.tsx가 감지 후 호출
            }
          } catch {
            // 재로딩 실패는 무시
          }
        }, 15_000);
      } else {
        setCookieMsg({ type: "err", text: result.error || "업로드 실패" });
      }
    } catch {
      setCookieMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setCookieUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setCookieOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>네이버 로그인 쿠키</CardTitle>
            {!cookieOpen && cookieStatus?.hasCookies && (
              <p className="mt-1 text-sm text-muted-foreground">
                {cookieStatus.cookieCount}개 쿠키 ·{" "}
                {cookieStatus.uploadedAt ? timeAgo(cookieStatus.uploadedAt) : ""}
              </p>
            )}
            {!cookieOpen && !cookieStatus?.hasCookies && (
              <p className="mt-1 text-sm text-yellow-600">쿠키 미등록</p>
            )}
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              cookieOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </CardHeader>
      {cookieOpen && (
        <CardContent className="space-y-3">
          {cookieStatus?.hasCookies && cookieStatus.uploadedAt && (
            <div className="rounded border bg-muted/50 px-3 py-2 text-sm">
              마지막 업로드: {timeAgo(cookieStatus.uploadedAt)} ({cookieStatus.cookieCount}개 쿠키)
            </div>
          )}
          <Textarea
            placeholder="EditThisCookie 등에서 내보낸 JSON을 여기에 붙여넣기..."
            rows={4}
            value={cookieJson}
            onChange={(e) => setCookieJson(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCookieUpload}
              disabled={cookieUploading || !cookieJson.trim()}
            >
              {cookieUploading ? "업로드 중..." : "쿠키 업로드"}
            </Button>
            {cookieMsg && (
              <span
                className={`text-sm ${
                  cookieMsg.type === "ok" ? "text-green-600" : "text-red-500"
                }`}
              >
                {cookieMsg.text}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Chrome &quot;EditThisCookie&quot; 확장 설치 &rarr; naver.com 로그인 &rarr; 확장
            아이콘 클릭 &rarr; Export &rarr; 여기에 붙여넣기
          </p>
        </CardContent>
      )}
    </Card>
  );
}
