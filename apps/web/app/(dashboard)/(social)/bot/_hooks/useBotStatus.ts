"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  PendingComment,
  RunLog,
  BotSettings,
  TodayStats,
  CookieStatus,
  BotCommandRecord,
  COMMAND_LABELS,
  defaultSettings,
  apiFetchStatus,
  apiFetchPending,
  apiFetchCookieStatus,
  apiFetchCommands,
  apiSendCommand,
} from "../_lib/bot-api";

// AudioContext 싱글톤 — 브라우저당 인스턴스 수 제한(6~8개) 회피
let _audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new AudioContext();
  }
  // suspended 상태(자동재생 정책)면 resume
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume();
  }
  return _audioCtx;
}

export interface ToastNotification {
  id: string;
  message: string;
  type: "success" | "error";
}

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
  toast: ToastNotification | null;

  // 액션
  fetchData: () => Promise<void>;
  fetchApproved: () => Promise<void>;
  sendCommand: (command: "run" | "execute" | "retry" | "auto_reply") => Promise<void>;
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
  // 폴링 interval ref — handleVisibility 클로저 stale 방지
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // running 상태 ref — visibilitychange 핸들러에서 안전하게 참조
  const isRunningRef = useRef(false);

  // 재실행 경고
  const [showRunWarning, setShowRunWarning] = useState(false);
  // 토스트 알림
  const [toast, setToast] = useState<ToastNotification | null>(null);

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

  // running 상태 ref 동기화 — visibilitychange 핸들러에서 stale closure 없이 참조
  // activeCommand가 null이면 status는 undefined → false → ref 자동 해제
  useEffect(() => {
    isRunningRef.current = activeCommand?.status === "running";
  }, [activeCommand?.status]);

  // 명령 완료/실패 시 팝업 알림 + 알림음
  const prevCommandRef = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    // 최신 완료/실패 명령 찾기
    const latest = botCommands
      .filter((c) => c.status === "completed" || c.status === "failed")
      .sort((a, b) => (b.completed_at || b.created_at).localeCompare(a.completed_at || a.created_at))[0];

    if (!latest) return;
    // 이전과 같은 명령이면 무시
    if (prevCommandRef.current?.id === latest.id && prevCommandRef.current?.status === latest.status) return;
    // 첫 로드 시에는 알림 안 띄움
    if (!prevCommandRef.current) {
      prevCommandRef.current = { id: latest.id, status: latest.status };
      return;
    }
    prevCommandRef.current = { id: latest.id, status: latest.status };

    const label = COMMAND_LABELS[latest.command as keyof typeof COMMAND_LABELS] || latest.command;
    const isSuccess = latest.status === "completed";
    const msg = isSuccess
      ? `✅ ${label} 완료!`
      : `❌ ${label} 실패`;

    // 브라우저 알림음 (싱글톤 AudioContext 사용)
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isSuccess ? 880 : 440;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + (isSuccess ? 0.15 : 0.3));
      if (isSuccess) {
        // 성공: 짧은 두 번 비프
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 1100;
          gain2.gain.value = 0.3;
          osc2.start();
          osc2.stop(ctx.currentTime + 0.15);
        }, 200);
      }
    } catch {
      // AudioContext 미지원 무시
    }

    // 브라우저 Notification API (허용된 경우, 탭이 비활성일 때)
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
      new Notification("인성이 봇", { body: msg });
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // 인라인 토스트 팝업
    const toastId = latest.id + latest.status;
    setToast({ id: toastId, message: msg, type: isSuccess ? "success" : "error" });
    setTimeout(() => setToast((prev) => prev?.id === toastId ? null : prev), 4000);
  }, [botCommands]);

  // 탭 비활성 시 폴링 제어 + 활성 명령 없으면 30초 간격
  // interval + isRunning 모두 ref로 관리 → handleVisibility 클로저 stale 방지
  useEffect(() => {
    const startPolling = () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      const ms = activeCommand ? 5000 : 30000;
      fetchCommands();
      pollingIntervalRef.current = setInterval(fetchCommands, ms);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else if (!isRunningRef.current) {
        // running 아닐 때만 폴링 중단 (배터리 절약)
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      // running 중에는 background여도 폴링 유지
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // activeCommand ID 변경 시 폴링 간격 조정 (불필요한 재실행 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCommands, activeCommand?.id]);

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
    async (command: "run" | "execute" | "retry" | "auto_reply") => {
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
      const [statusResult, pendingResult, cookieResult, approvedResult] =
        await Promise.allSettled([
          apiFetchStatus(),
          apiFetchPending("pending", { order: "desc", limit: 500 }),
          apiFetchCookieStatus(),
          apiFetchPending("approved", { order: "desc", limit: 500 }),
        ]);

      if (statusResult.status === "fulfilled") {
        const statusData = statusResult.value;
        setRuns(statusData.recentRuns || []);
        setTodayStats(statusData.todayStats || { bloggers: 0, comments: 0, failed: 0 });
        setPendingCount(statusData.pendingCount || 0);
        if (statusData.settings) {
          setSettings(statusData.settings);
        }
      } else {
        console.error("상태 조회 실패:", statusResult.reason);
      }

      if (pendingResult.status === "fulfilled") {
        setPending(pendingResult.value.comments || []);
      }

      if (cookieResult.status === "fulfilled") {
        setCookieStatus(cookieResult.value);
      }

      if (approvedResult.status === "fulfilled") {
        setApprovedComments(approvedResult.value.comments || []);
      }
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
    toast,
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
