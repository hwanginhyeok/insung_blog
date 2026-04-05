"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, AlertTriangle, Download, Cookie, Upload, CheckCircle } from "lucide-react";
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
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 타이머 정리 (언마운트 시)
  useEffect(() => {
    return () => {
      if (settingsTimeoutRef.current) clearTimeout(settingsTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

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

        // 2초 후 패널 자동 닫힘 (이전 타이머 취소 후 재설정)
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => setCookieOpen(false), 2000);

        // 상태 새로고침
        try {
          const refreshed = await apiFetchCookieStatus();
          onStatusChange(refreshed);
        } catch {
          // 새로고침 실패 무시
        }

        // 15초 후 settings 재로딩 (extract_blog_id 워커 처리 대기)
        settingsTimeoutRef.current = setTimeout(async () => {
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
                  cookieMsg.type === "ok" ? "text-primary" : "text-destructive"
                }`}
              >
                {cookieMsg.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span><strong>PC에서만 가능</strong> — 모바일에서는 쿠키 업로드 불가</span>
          </div>
          {/* 단계별 쿠키 등록 가이드 */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">쿠키 등록 방법 (PC Chrome)</p>
            <div className="grid gap-2">
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Download className="h-3 w-3 text-primary" />
                </div>
                <div className="text-xs">
                  <span className="font-medium">1. 확장 설치</span>
                  <span className="text-muted-foreground"> — Chrome 웹스토어에서 EditThisCookie 설치</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Cookie className="h-3 w-3 text-primary" />
                </div>
                <div className="text-xs">
                  <span className="font-medium">2. 네이버 로그인</span>
                  <span className="text-muted-foreground"> — naver.com에서 본인 계정으로 로그인</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="h-3 w-3 text-primary" />
                </div>
                <div className="text-xs">
                  <span className="font-medium">3. 쿠키 내보내기</span>
                  <span className="text-muted-foreground"> — 확장 아이콘 클릭 → Export 버튼 → JSON 복사</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle className="h-3 w-3 text-primary" />
                </div>
                <div className="text-xs">
                  <span className="font-medium">4. 붙여넣기</span>
                  <span className="text-muted-foreground"> — 위 입력란에 JSON을 붙여넣고 업로드</span>
                </div>
              </div>
            </div>
            <a
              href="/guide"
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              자세한 가이드 보기 →
            </a>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
