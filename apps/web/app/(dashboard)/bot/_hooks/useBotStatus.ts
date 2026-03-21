"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  PendingComment,
  RunLog,
  BotSettings,
  TodayStats,
  CookieStatus,
  BotCommandRecord,
  defaultSettings,
  apiFetchStatus,
  apiFetchPending,
  apiFetchCookieStatus,
  apiFetchCommands,
  apiSendCommand,
} from "../_lib/bot-api";

export interface BotStatusState {
  // 데이터
  pending: PendingComment[];
  approvedComments: PendingComment[];
  runs: RunLog[];
  settings: BotSettings;
  todayStats: TodayStats;
  pendingCount: number;
  cookieStatus: CookieStatus | null;

  // 봇 명령
  botCommands: BotCommandRecord[];
  activeCommand: BotCommandRecord | null;
  sendingCommand: boolean;
  commandError: string | null;
  elapsed: number;

  // UI 상태
  loading: boolean;
  showRunWarning: boolean;
  avgDuration: number | null;

  // 액션
  fetchData: () => Promise<void>;
  fetchApproved: () => Promise<void>;
  sendCommand: (command: "run" | "execute" | "retry") => Promise<void>;
  handleRunClick: () => void;
  setShowRunWarning: (v: boolean) => void;
  setPending: React.Dispatch<React.SetStateAction<PendingComment[]>>;
  setPendingCount: React.Dispatch<React.SetStateAction<number>>;
  setApprovedComments: React.Dispatch<React.SetStateAction<PendingComment[]>>;
  setSettings: React.Dispatch<React.SetStateAction<BotSettings>>;
  setCookieStatus: React.Dispatch<React.SetStateAction<CookieStatus | null>>;
}

export function useBotStatus(): BotStatusState {
  const [pending, setPending] = useState<PendingComment[]>([]);
  const [approvedComments, setApprovedComments] = useState<PendingComment[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [settings, setSettings] = useState<BotSettings>(defaultSettings);
  const [todayStats, setTodayStats] = useState<TodayStats>({
    bloggers: 0,
    comments: 0,
    failed: 0,
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);

  // 봇 명령 제어
  const [botCommands, setBotCommands] = useState<BotCommandRecord[]>([]);
  const [activeCommand, setActiveCommand] = useState<BotCommandRecord | null>(null);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 재실행 경고
  const [showRunWarning, setShowRunWarning] = useState(false);

  // approved 댓글 fetch
  const fetchApproved = useCallback(async () => {
    try {
      const data = await apiFetchPending("approved");
      setApprovedComments(data.comments || []);
    } catch {
      // 조회 실패 무시
    }
  }, []);

  // 봇 명령 폴링 (5초)
  const fetchCommands = useCallback(async () => {
    try {
      const data = await apiFetchCommands();
      setBotCommands(data.commands || []);
      setActiveCommand(data.activeCommand || null);
    } catch {
      // 폴링 실패는 무시
    }
  }, []);

  // 탭 비활성 시 폴링 중지 + 활성 명령 없으면 30초 간격
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) clearInterval(interval);
      const ms = activeCommand ? 5000 : 30000;
      fetchCommands();
      interval = setInterval(fetchCommands, ms);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        if (interval) clearInterval(interval);
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // activeCommand 변경 시 폴링 간격 조정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCommands, !!activeCommand]);

  // running 상태일 때 경과 시간 카운터
  useEffect(() => {
    if (activeCommand?.status === "running" && activeCommand.started_at) {
      const start = new Date(activeCommand.started_at).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      elapsedRef.current = setInterval(tick, 1000);
      return () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
      };
    } else {
      setElapsed(0);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
  }, [activeCommand?.status, activeCommand?.started_at]);

  // 명령 전송
  const sendCommand = useCallback(
    async (command: "run" | "execute" | "retry") => {
      setSendingCommand(true);
      setCommandError(null);
      try {
        const result = await apiSendCommand(command);
        if (!result.success) {
          setCommandError(result.error || "명령 전송 실패");
        } else {
          await fetchCommands();
        }
      } catch {
        setCommandError("네트워크 오류");
      } finally {
        setSendingCommand(false);
      }
    },
    [fetchCommands]
  );

  // "봇 실행" 클릭 핸들러 (재실행 방어)
  const handleRunClick = useCallback(() => {
    if (pending.length > 0 || approvedComments.length > 0) {
      setShowRunWarning(true);
    } else {
      sendCommand("run");
    }
  }, [pending.length, approvedComments.length, sendCommand]);

  // 데이터 로드
  const fetchData = useCallback(async () => {
    try {
      const [statusData, pendingData, cookieData, approvedData] =
        await Promise.all([
          apiFetchStatus(),
          apiFetchPending("pending"),
          apiFetchCookieStatus(),
          apiFetchPending("approved"),
        ]);

      setRuns(statusData.recentRuns || []);
      setTodayStats(statusData.todayStats || { bloggers: 0, comments: 0, failed: 0 });
      setPendingCount(statusData.pendingCount || 0);
      if (statusData.settings) {
        setSettings(statusData.settings);
      }

      setPending(pendingData.comments || []);

      setCookieStatus(cookieData);
      // 쿠키 없으면 기본 열림 (CookieStatusBadge에서 사용)
      // open 상태는 컴포넌트 자체에서 관리

      setApprovedComments(approvedData.comments || []);
    } catch (e) {
      console.error("데이터 로드 실패:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 평균 실행 시간
  const avgDuration =
    runs.length > 0
      ? Math.round(
          runs
            .filter((r) => r.duration_seconds != null)
            .reduce((sum, r) => sum + (r.duration_seconds || 0), 0) /
            Math.max(
              1,
              runs.filter((r) => r.duration_seconds != null).length
            )
        )
      : null;

  return {
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
    fetchData,
    fetchApproved,
    sendCommand,
    handleRunClick,
    setShowRunWarning,
    setPending,
    setPendingCount,
    setApprovedComments,
    setSettings,
    setCookieStatus,
  };
}
