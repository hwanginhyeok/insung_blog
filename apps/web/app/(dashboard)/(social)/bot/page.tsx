"use client";

import { useCallback, useEffect } from "react";
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
import { CommentCalendar } from "./_components/CommentCalendar";
import { CommentAnalyticsChart } from "./_components/CommentAnalyticsChart";
import { BotSettings, apiFetchStatus } from "./_lib/bot-api";

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
    fetchApproved,
    sendCommand,
    handleRunClick,
    setShowRunWarning,
    setPending,
    setPendingCount,
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

  const handleEdited = useCallback(
    (id: string, newText: string) => {
      setPending((prev) =>
        prev.map((c) => (c.id === id ? { ...c, comment_text: newText } : c))
      );
    },
    [setPending]
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
      <h1 className="text-2xl font-bold">댓글 봇</h1>

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
      />

      {/* 상태 카드 3개 */}
      <CommentStatsCard
        lastRun={lastRun}
        todayStats={todayStats}
        pendingCount={pendingCount}
        approvedCount={approvedComments.length}
      />

      {/* Step 2: 댓글 승인 */}
      <CommentApprovalPanel
        pending={pending}
        onApproved={handleApproved}
        onRejected={handleRejected}
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
    </div>
  );
}
