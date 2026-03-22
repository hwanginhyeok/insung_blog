"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  sendDiscoverNeighbors,
  sendVisitNeighbors,
  sendDiscoverAndVisit,
  fetchCommandStatus,
  fetchBlogThemes,
  saveBlogThemes,
  type BotCommandStatus,
} from "../_lib/neighbor-api";

interface Props {
  onComplete: () => void;
}

const COMMAND_LABELS: Record<string, string> = {
  discover_neighbors: "이웃 찾기",
  visit_neighbors: "이웃 방문 + 댓글 + 신청",
  discover_and_visit: "찾기 + 방문 + 댓글 + 신청",
};

export function NeighborActions({ onComplete }: Props) {
  const [keywords, setKeywords] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCmd, setActiveCmd] = useState<BotCommandStatus | null>(null);

  const [themes, setThemes] = useState<string[]>([]);
  const [editingThemes, setEditingThemes] = useState(false);
  const [themeInput, setThemeInput] = useState("");

  useEffect(() => {
    fetchBlogThemes().then(setThemes);
  }, []);

  const pollStatus = useCallback(async () => {
    const { activeCommand } = await fetchCommandStatus();
    setActiveCmd(activeCommand);
    if (!activeCommand && sending) {
      setSending(false);
      onComplete();
    }
  }, [sending, onComplete]);

  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(pollStatus, 3000);
    return () => clearInterval(timer);
  }, [sending, pollStatus]);

  async function sendCommand(
    fn: () => Promise<{ success: boolean; error?: string }>
  ) {
    setError(null);
    setSending(true);
    const result = await fn();
    if (!result.success) {
      setError(result.error || "명령 전송 실패");
      setSending(false);
    }
  }

  function getKeywords(): string[] {
    return keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  async function handleDiscover() {
    const kws = getKeywords();
    if (kws.length === 0) {
      setError("키워드를 입력해주세요 (쉼표로 구분)");
      return;
    }
    sendCommand(() => sendDiscoverNeighbors(kws));
  }

  async function handleDiscoverByThemes() {
    if (themes.length === 0) {
      setError("등록된 테마가 없습니다");
      return;
    }
    setKeywords(themes.join(", "));
    sendCommand(() => sendDiscoverNeighbors(themes));
  }

  async function handleVisit() {
    sendCommand(() => sendVisitNeighbors());
  }

  async function handleDiscoverAndVisit() {
    const kws = themes.length > 0 ? themes : getKeywords();
    if (kws.length === 0) {
      setError("테마를 등록하거나 키워드를 입력해주세요");
      return;
    }
    setKeywords(kws.join(", "));
    sendCommand(() => sendDiscoverAndVisit(kws));
  }

  async function handleSaveThemes() {
    const newThemes = themeInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const ok = await saveBlogThemes(newThemes);
    if (ok) {
      setThemes(newThemes);
      setEditingThemes(false);
    }
  }

  function startEditThemes() {
    setThemeInput(themes.join(", "));
    setEditingThemes(true);
  }

  const isRunning = sending || !!activeCmd;
  const statusLabel = activeCmd
    ? `${COMMAND_LABELS[activeCmd.command] || activeCmd.command} ${activeCmd.status === "running" ? "실행 중..." : "대기 중..."}`
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">자동화</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 테마 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">블로그 테마</span>
            {!editingThemes && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={startEditThemes}
              >
                수정
              </Button>
            )}
          </div>
          {editingThemes ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={themeInput}
                onChange={(e) => setThemeInput(e.target.value)}
                placeholder="정치, 경제, 부동산"
                className="flex-1 rounded border bg-background px-3 py-1.5 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleSaveThemes()}
              />
              <Button size="sm" onClick={handleSaveThemes}>
                저장
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingThemes(false)}
              >
                취소
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {themes.length > 0 ? (
                themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  등록된 테마 없음
                </span>
              )}
            </div>
          )}
        </div>

        {/* 이웃 찾기 */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="키워드 (쉼표 구분: 맛집, 육아, 여행)"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={isRunning}
              className="flex-1 rounded border bg-background px-3 py-1.5 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
            />
            <Button size="sm" onClick={handleDiscover} disabled={isRunning}>
              이웃 찾기
            </Button>
          </div>
          {themes.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscoverByThemes}
              disabled={isRunning}
              className="w-full"
            >
              테마로 이웃 찾기 ({themes.join(", ")})
            </Button>
          )}
        </div>

        {/* 이웃 방문 + 댓글 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            미방문 이웃 방문 → 댓글 생성 → 이웃 신청
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleVisit}
            disabled={isRunning}
          >
            이웃 방문
          </Button>
        </div>

        {/* 원클릭: 찾기 + 방문 + 댓글 + 신청 */}
        <Button
          onClick={handleDiscoverAndVisit}
          disabled={isRunning}
          className="w-full"
        >
          한 번에 실행 (찾기 → 방문 → 댓글 → 이웃 신청)
        </Button>

        {/* 상태 표시 */}
        {statusLabel && (
          <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {statusLabel}
          </div>
        )}
        {error && (
          <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
