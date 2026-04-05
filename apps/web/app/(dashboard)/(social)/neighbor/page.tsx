"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  sendFeedComment,
  sendDiscoverAndVisit,
  fetchCommandStatus,
  fetchBlogThemes,
  saveBlogThemes,
  fetchNeighborStats,
  fetchNeighborList,
  fetchInteractions,
  fetchRecommendations,
  type BotCommandStatus,
  type Neighbor,
  type NeighborStats,
  type NeighborInteraction,
  type NeighborRecommendation,
} from "./_lib/neighbor-api";
import { RecentInteractions } from "./_components/RecentInteractions";
import { NeighborRecommendations } from "./_components/NeighborRecommendations";
import { VisitResults } from "./_components/VisitResults";

/**
 * 이웃 관리 페이지 — 간소화 버전
 *
 * 2가지 핵심 액션:
 * 1. 이웃 새글 댓글 (feed_comment) — 기존 이웃의 새 글에 댓글
 * 2. 새 이웃 찾기 (discover_and_visit) — 키워드로 찾아서 댓글+이웃 신청
 *
 * + 이웃 현황 (간단 통계 + 목록)
 * + 최근 교류 / 추천 / 실행 이력
 */
export default function NeighborPage() {
  const [stats, setStats] = useState<NeighborStats | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [interactions, setInteractions] = useState<NeighborInteraction[]>([]);
  const [recommendations, setRecommendations] = useState<NeighborRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  // 자동화 상태
  const [sending, setSending] = useState(false);
  const [activeCmd, setActiveCmd] = useState<BotCommandStatus | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 테마
  const [themes, setThemes] = useState<string[]>([]);
  const [editingThemes, setEditingThemes] = useState(false);
  const [themeInput, setThemeInput] = useState("");

  // 이웃 목록 토글
  const [listVisible, setListVisible] = useState(false);

  // 하단 섹션 토글
  const [showVisitResults, setShowVisitResults] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchNeighborStats(),
      fetchNeighborList(),
      fetchBlogThemes(),
      fetchInteractions(),
      fetchRecommendations(),
    ]).then(([s, n, t, i, rec]) => {
      setStats(s);
      setNeighbors(n);
      setThemes(t);
      setInteractions(i);
      setRecommendations(rec);
      setLoading(false);
    });
  }, []);

  function refresh() {
    fetchNeighborStats().then(setStats);
    fetchNeighborList().then(setNeighbors);
    fetchInteractions().then(setInteractions);
    fetchRecommendations().then(setRecommendations);
  }

  // 명령 폴링
  const pollStatus = useCallback(async () => {
    const res = await fetchCommandStatus();
    setActiveCmd(res.activeCommand);
    if (!res.activeCommand && sending) {
      setSending(false);
      const commands = (res as { commands?: BotCommandStatus[] }).commands;
      const last = commands?.find((c) => c.status === "completed" || c.status === "failed");
      if (last?.result) {
        const r = last.result as Record<string, unknown>;
        setLastResult((r.message as string) || null);
      }
      refresh();
    }
  }, [sending]);

  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(pollStatus, 3000);
    return () => clearInterval(timer);
  }, [sending, pollStatus]);

  async function runCommand(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setLastResult(null);
    setSending(true);
    const result = await fn();
    if (!result.success) {
      setError(result.error || "명령 전송 실패");
      setSending(false);
    }
  }

  async function handleSaveThemes() {
    const newThemes = themeInput.split(",").map((t) => t.trim()).filter(Boolean);
    const ok = await saveBlogThemes(newThemes);
    if (ok) {
      setThemes(newThemes);
      setEditingThemes(false);
    }
  }

  const isRunning = sending || !!activeCmd;
  const statusLabel = activeCmd
    ? `${activeCmd.command === "feed_comment" ? "이웃 새글 댓글" : "새 이웃 찾기"} ${activeCmd.status === "running" ? "실행 중..." : "대기 중..."}`
    : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">이웃관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이웃의 새 글에 댓글을 달거나, 새로운 이웃을 찾아 관계를 넓힙니다.
        </p>
      </div>

      {/* 핵심 액션 2개 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. 이웃 새글 댓글 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">이웃 새글 댓글</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              이웃들이 올린 새 글에 AI 댓글을 생성합니다.
            </p>
            <Button
              onClick={() => runCommand(sendFeedComment)}
              disabled={isRunning}
              className="w-full"
            >
              새글에 댓글 달기
            </Button>
          </CardContent>
        </Card>

        {/* 2. 새 이웃 찾기 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">새 이웃 찾기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              테마 키워드로 블로거를 찾고 댓글 + 이웃 신청합니다.
            </p>

            {/* 테마 표시/수정 */}
            {editingThemes ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value)}
                  placeholder="맛집, 육아, 여행"
                  className="flex-1 rounded border bg-background px-3 py-1.5 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveThemes()}
                />
                <Button size="sm" onClick={handleSaveThemes}>저장</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingThemes(false)}>취소</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {themes.length > 0 ? (
                    themes.map((t) => (
                      <span key={t} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">테마 미등록</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setThemeInput(themes.join(", ")); setEditingThemes(true); }}>
                  수정
                </Button>
              </div>
            )}

            <Button
              onClick={() => {
                const kws = themes.length > 0 ? themes : [];
                if (kws.length === 0) {
                  setError("테마를 먼저 등록해주세요");
                  return;
                }
                runCommand(() => sendDiscoverAndVisit(kws));
              }}
              disabled={isRunning || themes.length === 0}
              className="w-full"
              variant="outline"
            >
              찾기 + 댓글 + 이웃 신청
            </Button>
            {themes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                위에서 테마를 먼저 등록하면 이웃 찾기를 시작할 수 있어요
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 상태 표시 */}
      {statusLabel && (
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {statusLabel}
        </div>
      )}
      {lastResult && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {lastResult}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 이웃 현황 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              이웃 현황
              {loading ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">불러오는 중...</span>
              ) : stats ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  서로이웃 {stats.neighbors.byType.mutual}명 · 전체 {stats.neighbors.total}명
                </span>
              ) : null}
            </CardTitle>
            {/* 이웃 0명이면 목록 보기 없이 바로 안내 표시 */}
            {!loading && neighbors.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setListVisible(!listVisible)}
              >
                {listVisible ? "접기" : "목록 보기"}
              </Button>
            )}
          </div>
        </CardHeader>

        {/* 이웃 없을 때 빈 상태 안내 — 목록 보기 전에도 표시 */}
        {!loading && neighbors.length === 0 && (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground py-3">
              아직 이웃이 없어요. &lsquo;새 이웃 찾기&rsquo;로 시작해보세요.
            </p>
          </CardContent>
        )}

        {listVisible && neighbors.length > 0 && (
          <CardContent className="pt-0">
            {neighbors.length === 0 ? null : (
              <div className="divide-y max-h-96 overflow-y-auto">
                {neighbors.slice(0, 50).map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{n.blog_name || n.blog_id}</span>
                      {n.category && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">{n.category}</span>
                      )}
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      n.neighbor_type === "mutual"
                        ? "bg-green-100 text-green-700"
                        : n.neighbor_type === "one_way_following"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                    }`}>
                      {n.neighbor_type === "mutual" ? "서로이웃" : n.neighbor_type === "one_way_following" ? "팔로잉" : "발견"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 이웃 추천 — recommendations가 있을 때만 표시 */}
      {recommendations.length > 0 && (
        <NeighborRecommendations
          recommendations={recommendations}
          onUpdate={refresh}
        />
      )}

      {/* 최근 교류 */}
      <RecentInteractions interactions={interactions} />

      {/* 실행 이력 + 대기 댓글 — 토글로 표시 */}
      <div className="space-y-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground"
          onClick={() => setShowVisitResults(!showVisitResults)}
        >
          {showVisitResults ? "실행 이력 접기" : "실행 이력 / 대기 댓글 보기"}
        </Button>
        {showVisitResults && <VisitResults />}
      </div>
    </div>
  );
}
