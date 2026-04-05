"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/HelpTooltip";
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
import {
  apiFetchPending,
  apiFetchStatus,
  apiApprovePendingComment,
  apiSendCommand,
  apiSaveSettings,
  type PendingComment,
  type BotSettings,
  defaultSettings,
  timeAgo,
} from "../bot/_lib/bot-api";
import { RecentInteractions } from "./_components/RecentInteractions";
import { NeighborRecommendations } from "./_components/NeighborRecommendations";
import { VisitResults } from "./_components/VisitResults";

/**
 * 이웃 관리 페이지
 *
 * 핵심 액션:
 * 1. 이웃 새글 댓글 (feed_comment)
 * 2. 새 이웃 찾기 (discover_and_visit)
 * 3. 대기 댓글 승인/거부 + 게시
 * 4. 자동화 토글 (자동 발견, 자동 승인, 자동 게시)
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

  // ── 대기 댓글 상태 ──
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [approvedComments, setApprovedComments] = useState<PendingComment[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<string | null>(null);

  // ── 봇 설정 (자동화 토글용) ──
  const [botSettings, setBotSettings] = useState<BotSettings>(defaultSettings);
  const [savingToggle, setSavingToggle] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchNeighborStats(),
      fetchNeighborList(),
      fetchBlogThemes(),
      fetchInteractions(),
      fetchRecommendations(),
      apiFetchPending("pending", { order: "desc", limit: 100 }),
      apiFetchPending("approved", { order: "desc", limit: 100 }),
      apiFetchStatus(),
    ]).then(([s, n, t, i, rec, pendingRes, approvedRes, statusRes]) => {
      setStats(s);
      setNeighbors(n);
      setThemes(t);
      setInteractions(i);
      setRecommendations(rec);
      setPendingComments(pendingRes.comments || []);
      setApprovedComments(approvedRes.comments || []);
      if (statusRes.settings) setBotSettings(statusRes.settings);
      setLoading(false);
    });
  }, []);

  function refresh() {
    fetchNeighborStats().then(setStats);
    fetchNeighborList().then(setNeighbors);
    fetchInteractions().then(setInteractions);
    fetchRecommendations().then(setRecommendations);
  }

  /** 대기/승인 댓글 새로고침 */
  async function refreshComments() {
    const [pendingRes, approvedRes] = await Promise.all([
      apiFetchPending("pending", { order: "desc", limit: 100 }),
      apiFetchPending("approved", { order: "desc", limit: 100 }),
    ]);
    setPendingComments(pendingRes.comments || []);
    setApprovedComments(approvedRes.comments || []);
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
      refreshComments();
    }
  }, [sending]);

  useEffect(() => {
    if (!sending && !executing) return;
    const timer = setInterval(pollStatus, 3000);
    return () => clearInterval(timer);
  }, [sending, executing, pollStatus]);

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

  // ── 댓글 승인/거부 핸들러 ──
  async function handleCommentAction(id: string, action: "approve" | "reject") {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const ok = await apiApprovePendingComment(id, action);
      if (ok) {
        if (action === "approve") {
          // pending → approved 이동
          const comment = pendingComments.find((c) => c.id === id);
          setPendingComments((prev) => prev.filter((c) => c.id !== id));
          if (comment) {
            setApprovedComments((prev) => [{ ...comment, status: "approved" }, ...prev]);
          }
        } else {
          setPendingComments((prev) => prev.filter((c) => c.id !== id));
        }
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleBulkApprove() {
    for (const c of pendingComments) {
      await handleCommentAction(c.id, "approve");
    }
  }

  async function handleRevokeApproval(id: string) {
    const ok = await apiApprovePendingComment(id, "revoke");
    if (ok) {
      const comment = approvedComments.find((c) => c.id === id);
      setApprovedComments((prev) => prev.filter((c) => c.id !== id));
      if (comment) {
        setPendingComments((prev) => [{ ...comment, status: "pending" }, ...prev]);
      }
    }
  }

  // ── 댓글 게시 실행 ──
  async function handleExecute() {
    setExecuting(true);
    setExecuteResult(null);
    setError(null);
    const result = await apiSendCommand("execute");
    if (!result.success) {
      setError(result.error || "게시 명령 전송 실패");
      setExecuting(false);
    } else {
      setExecuteResult("게시 명령을 전송했습니다. 잠시 기다려주세요...");
      // 폴링으로 완료 감지
      const checkDone = setInterval(async () => {
        const cmdRes = await fetchCommandStatus();
        if (!cmdRes.activeCommand) {
          clearInterval(checkDone);
          setExecuting(false);
          setExecuteResult("게시 완료!");
          await refreshComments();
        }
      }, 3000);
      // 최대 5분 타임아웃
      setTimeout(() => {
        clearInterval(checkDone);
        setExecuting(false);
      }, 300000);
    }
  }

  // ── 자동화 토글 저장 ──
  async function handleToggleSetting(patch: Partial<BotSettings>) {
    setSavingToggle(true);
    const updated = { ...botSettings, ...patch };
    const result = await apiSaveSettings(updated);
    if (result.success && result.settings) {
      setBotSettings(result.settings);
    }
    setSavingToggle(false);
  }

  const isRunning = sending || !!activeCmd;
  const statusLabel = activeCmd
    ? `${activeCmd.command === "feed_comment" ? "이웃 새글 댓글" : activeCmd.command === "execute" ? "댓글 게시" : "새 이웃 찾기"} ${activeCmd.status === "running" ? "실행 중..." : "대기 중..."}`
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
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold">이웃관리</h1>
          <HelpTooltip text="테마 기반으로 새 이웃을 발견하고, 자동으로 서로이웃 신청합니다." />
        </div>
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
                      <span key={t} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
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
      {executeResult && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {executeResult}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── 대기 댓글 승인 섹션 ── */}
      {(pendingComments.length > 0 || approvedComments.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                댓글 승인
                {pendingComments.length > 0 && (
                  <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-white">
                    {pendingComments.length}
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-1.5">
                {pendingComments.length > 1 && (
                  <Button size="sm" onClick={handleBulkApprove}>
                    일괄 승인
                  </Button>
                )}
                {approvedComments.length > 0 && (
                  <Button
                    size="sm"
                    onClick={handleExecute}
                    disabled={executing || isRunning}
                  >
                    {executing ? "게시 중..." : `게시 (${approvedComments.length}건)`}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 대기 중인 댓글 목록 */}
            {pendingComments.length > 0 && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {pendingComments.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{c.blog_id}</span>
                          <span>{timeAgo(c.created_at)}</span>
                        </div>
                        {c.post_url && (
                          <a
                            href={c.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            {c.post_title || "제목 없음"}
                          </a>
                        )}
                        <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                          {c.comment_text}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCommentAction(c.id, "approve")}
                          disabled={processingIds.has(c.id)}
                        >
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => handleCommentAction(c.id, "reject")}
                          disabled={processingIds.has(c.id)}
                        >
                          거부
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pendingComments.length === 0 && approvedComments.length > 0 && (
              <p className="text-sm text-muted-foreground">대기 중인 댓글이 없습니다</p>
            )}

            {/* 승인된 댓글 (게시 대기) */}
            {approvedComments.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  게시 대기 ({approvedComments.length}건)
                </p>
                <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1">
                  {approvedComments.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">
                          <span className="font-medium">[{c.blog_id}]</span>{" "}
                          <span className="text-muted-foreground">
                            {c.comment_text.length > 40 ? c.comment_text.slice(0, 40) + "..." : c.comment_text}
                          </span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        onClick={() => handleRevokeApproval(c.id)}
                      >
                        취소
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 자동 이웃 관리 토글 ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">자동 이웃 관리</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* 자동 발견+방문 */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                role="switch"
                aria-checked={botSettings.daily_discover}
                disabled={savingToggle}
                onClick={() => handleToggleSetting({ daily_discover: !botSettings.daily_discover })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  botSettings.daily_discover ? "bg-primary" : "bg-muted"
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  botSettings.daily_discover ? "translate-x-5" : "translate-x-1"
                }`} />
              </button>
              <span className="text-muted-foreground">
                자동 발견+방문
                {botSettings.daily_discover && <span className="ml-1 text-xs text-primary">매일 오전 9시</span>}
              </span>
            </label>

            {/* 자동 댓글 승인 */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                role="switch"
                aria-checked={botSettings.approval_mode === "auto"}
                disabled={savingToggle}
                onClick={() => handleToggleSetting({
                  approval_mode: botSettings.approval_mode === "auto" ? "manual" : "auto",
                })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  botSettings.approval_mode === "auto" ? "bg-primary" : "bg-muted"
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  botSettings.approval_mode === "auto" ? "translate-x-5" : "translate-x-1"
                }`} />
              </button>
              <span className="text-muted-foreground">자동 승인</span>
            </label>

            {/* 자동 게시 */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                role="switch"
                aria-checked={botSettings.auto_execute}
                disabled={savingToggle}
                onClick={() => handleToggleSetting({ auto_execute: !botSettings.auto_execute })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  botSettings.auto_execute ? "bg-primary" : "bg-muted"
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  botSettings.auto_execute ? "translate-x-5" : "translate-x-1"
                }`} />
              </button>
              <span className="text-muted-foreground">자동 게시</span>
            </label>
          </div>
          {botSettings.approval_mode === "auto" && botSettings.auto_execute && (
            <p className="mt-2 text-xs text-yellow-600">
              자동 승인 + 자동 게시가 모두 켜져 있으면 댓글이 검토 없이 게시됩니다.
            </p>
          )}
        </CardContent>
      </Card>

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
                        ? "bg-primary/10 text-primary"
                        : n.neighbor_type === "one_way_following"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-muted text-muted-foreground"
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

      {/* 실행 이력 — 토글로 표시 */}
      <div className="space-y-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground"
          onClick={() => setShowVisitResults(!showVisitResults)}
        >
          {showVisitResults ? "실행 이력 접기" : "실행 이력 보기"}
        </Button>
        {showVisitResults && <VisitResults />}
      </div>
    </div>
  );
}
