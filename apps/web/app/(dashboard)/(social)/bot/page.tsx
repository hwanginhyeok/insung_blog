"use client";

import { useCallback, useEffect } from "react";
import { KeyRound } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useBotStatus } from "./_hooks/useBotStatus";
import { useCommentHistory } from "./_hooks/useCommentHistory";
import { useBotSettings } from "./_hooks/useBotSettings";
import { BotControlPanel } from "./_components/BotControlPanel";
import { CommentStatsCard } from "./_components/CommentStatsCard";
import { CommentApprovalPanel } from "./_components/CommentApprovalPanel";
import { CommentHistoryTable } from "./_components/CommentHistoryTable";
import { BotSettingsPanel } from "./_components/BotSettingsPanel";
import { CookieStatusBadge } from "./_components/CookieStatusBadge";
import { RunHistoryPanel } from "./_components/RunHistoryPanel";
import { MonthlyReport } from "./_components/MonthlyReport";
import { CommentCalendar } from "./_components/CommentCalendar";
import { CommentAnalyticsChart } from "./_components/CommentAnalyticsChart";
import { BotSettings, apiSaveSettings, apiFetchStatus } from "./_lib/bot-api";

export default function BotPage() {
  const {
    pending,
    approvedComments,
    runs,
    settings,
    todayStats,
    pendingCount,
    cookieStatus,
    botCommands,
    activeCommand,
    sendingCommand,
    commandError,
    elapsed,
    loading,
    showRunWarning,
    avgDuration,
    toast,
    fetchApproved,
    sendCommand,
    handleRunClick,
    setShowRunWarning,
    setPending,
    setPendingCount,
    setApprovedComments,
    setSettings,
    setCookieStatus,
  } = useBotStatus();

  // settings 저장 후 콜백
  const handleSettingsSaved = useCallback(
    (saved: BotSettings) => {
      setSettings(saved);
    },
    [setSettings]
  );

  const {
    settingsDraft,
    settingsSaving,
    setSettingsDraft,
    resetDraft,
    handleSaveSettings,
  } = useBotSettings(handleSettingsSaved);

  // 최초 데이터 로드 완료 후 settings → draft 동기화
  useEffect(() => {
    resetDraft(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.naver_blog_id, settings.approval_mode]);

  const { historyTab, history, historyLoading, setHistoryTab } = useCommentHistory();

  // 쿠키 업로드 후 settings 재로딩
  const handleSettingsRefresh = useCallback(async () => {
    try {
      const data = await apiFetchStatus();
      if (data.settings) {
        setSettings(data.settings);
        resetDraft(data.settings);
      }
    } catch {
      // 재로딩 실패 무시
    }
  }, [setSettings, resetDraft]);

  // CommentApprovalPanel 콜백
  const handleApproved = useCallback(
    async (id: string) => {
      setPending((prev) => prev.filter((c) => c.id !== id));
      setPendingCount((prev) => Math.max(0, prev - 1));
      await fetchApproved();
    },
    [setPending, setPendingCount, fetchApproved]
  );

  const handleRejected = useCallback(
    (id: string) => {
      setPending((prev) => prev.filter((c) => c.id !== id));
      setPendingCount((prev) => Math.max(0, prev - 1));
    },
    [setPending, setPendingCount]
  );

  const handleRevoked = useCallback(
    async (id: string) => {
      setApprovedComments((prev) => prev.filter((c) => c.id !== id));
      setPendingCount((prev) => prev + 1);
    },
    [setApprovedComments, setPendingCount]
  );

  const handleEdited = useCallback(
    (id: string, newText: string) => {
      setPending((prev) =>
        prev.map((c) => (c.id === id ? { ...c, comment_text: newText } : c))
      );
    },
    [setPending]
  );

  // 자동 모드 토글 (daily_discover / auto_execute 즉시 저장)
  const handleSaveSettingsPatch = useCallback(
    async (patch: Partial<BotSettings>) => {
      const result = await apiSaveSettings({ ...settings, ...patch });
      if (result.success && result.settings) {
        setSettings(result.settings);
      }
    },
    [settings, setSettings]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  const lastRun = runs[0];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold">댓글봇</h1>
          <HelpTooltip text="이웃 블로그에 AI 댓글을 자동 생성합니다. 승인 모드에서는 직접 확인 후 게시됩니다." />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          내 블로그에 댓글 남긴 사람들의 블로그에 방문해서 AI 댓글을 남깁니다.
        </p>
      </div>

      {/* 쿠키 미등록 온보딩 배너 */}
      {!cookieStatus?.hasCookies && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="h-6 w-6 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <h3 className="font-semibold text-amber-900">네이버 쿠키를 먼저 등록해주세요</h3>
              <p className="text-sm text-amber-800 leading-relaxed">
                댓글봇을 사용하려면 네이버 로그인 쿠키가 필요합니다.
                아래 <strong>&quot;네이버 쿠키&quot;</strong> 섹션에서 쿠키를 업로드해주세요.
              </p>
              <button
                type="button"
                className="text-sm font-medium text-amber-700 underline hover:text-amber-900"
                onClick={() => document.getElementById("cookie-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                쿠키 업로드하러 가기 ↓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3단계 Stepper + Step 1 봇 실행 + Step 3 댓글 게시 */}
      <BotControlPanel
        pending={pending}
        approvedComments={approvedComments}
        settings={settings}
        activeCommand={activeCommand}
        botCommands={botCommands}
        sendingCommand={sendingCommand}
        commandError={commandError}
        elapsed={elapsed}
        avgDuration={avgDuration}
        showRunWarning={showRunWarning}
        onRunClick={handleRunClick}
        onSendCommand={sendCommand}
        onConfirmRun={() => {
          setShowRunWarning(false);
          sendCommand("run");
        }}
        onCancelRunWarning={() => setShowRunWarning(false)}
        onSaveSettingsPatch={handleSaveSettingsPatch}
      />

      {/* 상태 카드 3개 */}
      <CommentStatsCard
        lastRun={lastRun}
        todayStats={todayStats}
        pendingCount={pendingCount}
        approvedCount={approvedComments.length}
      />

      {/* Step 2: 댓글 승인 */}
      <div id="comment-approval" />
      <CommentApprovalPanel
        pending={pending}
        approvedComments={approvedComments}
        onApproved={handleApproved}
        onRejected={handleRejected}
        onRevoked={handleRevoked}
        onEdited={handleEdited}
        onBulkApproved={fetchApproved}
      />

      {/* 댓글 분석 차트 + 활동 캘린더 */}
      <CommentAnalyticsChart />
      <CommentCalendar days={28} />

      {/* 댓글 내역 (접기/펼치기) */}
      <CommentHistoryTable
        historyTab={historyTab}
        history={history}
        historyLoading={historyLoading}
        onTabChange={setHistoryTab}
      />

      {/* 네이버 쿠키 (접기/펼치기) */}
      <div id="cookie-section" />
      <CookieStatusBadge
        cookieStatus={cookieStatus}
        onStatusChange={setCookieStatus}
        onSettingsRefresh={handleSettingsRefresh}
      />

      {/* 설정 (접기/펼치기) */}
      <BotSettingsPanel
        settingsDraft={settingsDraft}
        settingsSaving={settingsSaving}
        cookieStatus={cookieStatus}
        onDraftChange={setSettingsDraft}
        onSave={handleSaveSettings}
      />

      {/* 최근 실행 이력 (접기/펼치기) */}
      <RunHistoryPanel runs={runs} avgDuration={avgDuration} />

      {/* 월간 성과 리포트 (접기/펼치기) */}
      <MonthlyReport runs={runs} todayStats={todayStats} />

      {/* 토스트 알림 */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium text-white transition-all animate-fade-up ${
            toast.type === "success" ? "bg-primary" : "bg-destructive"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
