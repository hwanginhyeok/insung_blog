"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown } from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────────

interface PendingComment {
  id: string;
  blog_id: string;
  post_url: string;
  post_title: string;
  comment_text: string;
  ai_generated: boolean;
  status: string;
  created_at: string;
}

interface RunLog {
  id: string;
  run_at: string;
  bloggers_visited: number;
  comments_written: number;
  comments_failed: number;
  pending_count: number;
  error_message: string | null;
  duration_seconds: number | null;
}

interface BotSettings {
  approval_mode: string;
  is_active: boolean;
  weekday_hours: { start: number; end: number };
  weekend_hours: { start: number; end: number };
  max_comments_per_day: number;
  max_bloggers_per_day: number;
  naver_blog_id: string | null;
  comment_prompt: string | null;
}

interface TodayStats {
  bloggers: number;
  comments: number;
  failed: number;
}

interface CookieStatus {
  hasCookies: boolean;
  uploadedAt?: string;
  cookieCount?: number;
}

interface BotCommandRecord {
  id: string;
  command: "run" | "execute" | "retry";
  status: "pending" | "running" | "completed" | "failed";
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const COMMAND_LABELS: Record<string, string> = {
  run: "봇 실행",
  execute: "댓글 게시",
  retry: "재시도",
};

const defaultSettings: BotSettings = {
  approval_mode: "manual",
  is_active: true,
  weekday_hours: { start: 20, end: 24 },
  weekend_hours: { start: 13, end: 18 },
  max_comments_per_day: 30,
  max_bloggers_per_day: 10,
  naver_blog_id: null,
  comment_prompt: null,
};

// 댓글 내역 상태별 뱃지
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  approved: { label: "승인", className: "bg-blue-100 text-blue-700" },
  posted: { label: "게시완료", className: "bg-green-100 text-green-700" },
  rejected: { label: "거부", className: "bg-gray-100 text-gray-600" },
  failed: { label: "실패", className: "bg-red-100 text-red-700" },
};

const HISTORY_TABS = [
  { key: "all", label: "전체" },
  { key: "approved", label: "승인" },
  { key: "posted", label: "게시완료" },
  { key: "rejected", label: "거부" },
  { key: "failed", label: "실패" },
] as const;

const DEFAULT_PROMPT_PLACEHOLDER = `말투와 스타일:
- 친근한 해요체 (~했어요, ~이에요, ~예요, ~네요)
- 가볍고 일상적인 톤, 센스있고 위트있게
- 뻔한 인사("안녕하세요")나 광고성 표현 금지
- 이모티콘/이모지 자연스럽게 섞기 (ㅎㅎ, ㅋㅋ, >,<, ❤️ 등)

내용:
- 본문에서 구체적 정보 2~3가지를 골라서 언급
- 확실하게 보이는 것만 언급 (추측 금지)
- 공감 + 나도 해보고 싶다는 느낌 + 감사 표현을 자연스럽게 섞기

형식:
- 3~6줄, 100~200자
- 줄바꿈으로 호흡 나누기
- 마지막 줄은 감사/응원으로 마무리`;

// ── 유틸 ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

// ── 3단계 Stepper ───────────────────────────────────────────

const STEPS = [
  { num: 1, label: "봇 실행", desc: "댓글 수집" },
  { num: 2, label: "댓글 승인", desc: "내용 확인" },
  { num: 3, label: "댓글 게시", desc: "네이버 발행" },
] as const;

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => (
        <div key={step.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                step.num === currentStep
                  ? "bg-primary text-primary-foreground"
                  : step.num < currentStep
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step.num}
            </div>
            <div className="text-center">
              <p
                className={`text-xs font-medium ${
                  step.num === currentStep
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </p>
              <p className="text-[10px] text-muted-foreground">{step.desc}</p>
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mx-3 mt-[-18px] h-0.5 w-12 sm:w-20 ${
                step.num < currentStep ? "bg-primary/40" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────

export default function BotPage() {
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
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<BotSettings>(defaultSettings);
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [cookieJson, setCookieJson] = useState("");
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 댓글 내역
  const [historyTab, setHistoryTab] = useState<string>("all");
  const [history, setHistory] = useState<PendingComment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 봇 명령 제어
  const [botCommands, setBotCommands] = useState<BotCommandRecord[]>([]);
  const [activeCommand, setActiveCommand] = useState<BotCommandRecord | null>(null);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 접기/펼치기
  const [cookieOpen, setCookieOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);

  // 재실행 경고
  const [showRunWarning, setShowRunWarning] = useState(false);

  // approved 댓글 fetch
  const fetchApproved = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/pending?status=approved");
      if (res.ok) {
        const data = await res.json();
        setApprovedComments(data.comments || []);
      }
    } catch {
      // 조회 실패 무시
    }
  }, []);

  // 댓글 내역 조회
  const fetchHistory = useCallback(async (status: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/bot/pending?status=${status}&order=desc&limit=50`
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data.comments || []);
      }
    } catch {
      // 조회 실패 무시
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(historyTab);
  }, [historyTab, fetchHistory]);

  // 봇 명령 폴링 (5초)
  const fetchCommands = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/command");
      if (res.ok) {
        const data = await res.json();
        setBotCommands(data.commands || []);
        setActiveCommand(data.activeCommand || null);
      }
    } catch {
      // 폴링 실패는 무시
    }
  }, []);

  useEffect(() => {
    fetchCommands();
    const interval = setInterval(fetchCommands, 5000);
    return () => clearInterval(interval);
  }, [fetchCommands]);

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
  async function sendCommand(command: "run" | "execute" | "retry") {
    setSendingCommand(true);
    setCommandError(null);
    try {
      const res = await fetch("/api/bot/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommandError(data.error || "명령 전송 실패");
      } else {
        // 즉시 폴링 갱신
        await fetchCommands();
      }
    } catch {
      setCommandError("네트워크 오류");
    } finally {
      setSendingCommand(false);
    }
  }

  // "봇 실행" 클릭 핸들러 (재실행 방어)
  function handleRunClick() {
    if (pending.length > 0 || approvedComments.length > 0) {
      setShowRunWarning(true);
    } else {
      sendCommand("run");
    }
  }

  // 데이터 로드
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, pendingRes, cookieRes, approvedRes] = await Promise.all([
        fetch("/api/bot/status"),
        fetch("/api/bot/pending"),
        fetch("/api/bot/cookies"),
        fetch("/api/bot/pending?status=approved"),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setRuns(data.recentRuns || []);
        setTodayStats(data.todayStats || { bloggers: 0, comments: 0, failed: 0 });
        setPendingCount(data.pendingCount || 0);
        if (data.settings) {
          setSettings(data.settings);
          setSettingsDraft(data.settings);
        }
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data.comments || []);
      }

      if (cookieRes.ok) {
        const cookieData = await cookieRes.json();
        setCookieStatus(cookieData);
        // 쿠키 있으면 기본 접힘
        setCookieOpen(!cookieData.hasCookies);
      }

      if (approvedRes.ok) {
        const data = await approvedRes.json();
        setApprovedComments(data.comments || []);
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

  // 댓글 승인/거부
  async function handleAction(id: string, action: "approve" | "reject") {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/bot/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((c) => c.id !== id));
        setPendingCount((prev) => Math.max(0, prev - 1));
        // 승인 시 approved 목록 갱신
        if (action === "approve") {
          await fetchApproved();
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

  // 일괄 승인
  async function handleBulkApprove() {
    setBulkApproving(true);
    try {
      for (const c of pending) {
        await handleAction(c.id, "approve");
      }
    } finally {
      setBulkApproving(false);
    }
  }

  // 댓글 수정 저장
  async function handleEditSave(id: string) {
    if (!editText.trim()) return;
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/bot/pending", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, comment_text: editText }),
      });
      if (res.ok) {
        setPending((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, comment_text: editText.trim() } : c
          )
        );
        setEditingId(null);
        setEditText("");
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // 설정 저장
  async function handleSaveSettings() {
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  // 쿠키 업로드
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
      const res = await fetch("/api/bot/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookieData: parsed }),
      });
      const data = await res.json();
      if (res.ok) {
        setCookieMsg({ type: "ok", text: `${data.cookieCount}개 쿠키 업로드 완료 — 블로그 ID 자동 감지 중...` });
        setCookieJson("");
        // 상태 새로고침
        const refreshRes = await fetch("/api/bot/cookies");
        if (refreshRes.ok) setCookieStatus(await refreshRes.json());
        // 15초 후 settings 재로딩 (extract_blog_id 워커 처리 대기)
        setTimeout(async () => {
          try {
            const statusRes = await fetch("/api/bot/status");
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.settings) {
                setSettings(statusData.settings);
                setSettingsDraft(statusData.settings);
                if (statusData.settings.naver_blog_id) {
                  setCookieMsg({ type: "ok", text: `블로그 ID 자동 감지: ${statusData.settings.naver_blog_id}` });
                }
              }
            }
          } catch {
            // 재로딩 실패는 무시
          }
        }, 15_000);
      } else {
        setCookieMsg({ type: "err", text: data.error || "업로드 실패" });
      }
    } catch {
      setCookieMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setCookieUploading(false);
    }
  }

  // 현재 단계 결정
  function getCurrentStep(): number {
    if (activeCommand?.command === "run" && (activeCommand.status === "pending" || activeCommand.status === "running")) return 1;
    if (activeCommand?.command === "execute" && (activeCommand.status === "pending" || activeCommand.status === "running")) return 3;
    if (activeCommand?.command === "retry" && (activeCommand.status === "pending" || activeCommand.status === "running")) return 3;
    if (pending.length > 0) return 2;
    if (approvedComments.length > 0) return 3;
    return 1;
  }

  // 평균 실행 시간
  const avgDuration = runs.length > 0
    ? Math.round(
        runs.filter((r) => r.duration_seconds != null).reduce((sum, r) => sum + (r.duration_seconds || 0), 0) /
          Math.max(1, runs.filter((r) => r.duration_seconds != null).length)
      )
    : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  const lastRun = runs[0];
  const currentStep = getCurrentStep();
  const isRunCommand = activeCommand?.command === "run";
  const isExecuteCommand = activeCommand?.command === "execute" || activeCommand?.command === "retry";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">댓글 봇</h1>

      {/* ── 3단계 플로우 Stepper ─────────────────── */}
      <Card>
        <CardContent className="pt-6 pb-4">
          <Stepper currentStep={currentStep} />
        </CardContent>
      </Card>

      {/* ── 상태 카드 ─────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>마지막 실행</CardDescription>
          </CardHeader>
          <CardContent>
            {lastRun ? (
              <>
                <p className="text-lg font-semibold">
                  {timeAgo(lastRun.run_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(lastRun.run_at)}
                  {lastRun.error_message && " (오류)"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">실행 이력 없음</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>오늘 현황</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {todayStats.bloggers}명 / {todayStats.comments}개
            </p>
            <p className="text-sm text-muted-foreground">
              방문 {todayStats.bloggers}명 · 댓글 {todayStats.comments}개
              {todayStats.failed > 0 && ` · 실패 ${todayStats.failed}개`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>대기 현황</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {pendingCount}건 / {approvedComments.length}건
            </p>
            <p className="text-sm text-muted-foreground">
              승인 대기 {pendingCount}건 · 게시 대기 {approvedComments.length}건
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── STEP 1: 봇 실행 ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              1
            </span>
            봇 실행
          </CardTitle>
          <CardDescription>
            블로거를 방문하고 AI 댓글을 수집합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 재실행 경고 */}
          {showRunWarning && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-2">
              <p className="text-sm text-yellow-800">
                승인 대기 {pending.length}건, 게시 대기 {approvedComments.length}건이 있습니다.
                <br />
                봇을 다시 실행하면 새로운 댓글이 추가됩니다.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                  onClick={() => {
                    setShowRunWarning(false);
                    sendCommand("run");
                  }}
                >
                  그래도 실행
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRunWarning(false)}
                >
                  취소
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunClick}
              disabled={sendingCommand || !!activeCommand || !settings.naver_blog_id}
            >
              {sendingCommand ? "전송 중..." : "봇 실행"}
            </Button>
            {!settings.naver_blog_id && (
              <span className="text-sm text-muted-foreground">
                블로그 ID를 먼저 설정하세요 (하단 설정)
              </span>
            )}
          </div>

          {commandError && activeCommand?.command !== "execute" && activeCommand?.command !== "retry" && (
            <p className="text-sm text-red-500">{commandError}</p>
          )}

          {/* run 명령 진행 표시 */}
          {isRunCommand && activeCommand && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              {activeCommand.status === "pending" && (
                <p className="text-sm">
                  <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  대기 중: 봇 실행 명령 전송됨...
                </p>
              )}
              {activeCommand.status === "running" && (
                <>
                  <p className="text-sm">
                    <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    진행 중: 봇 실행...{" "}
                    <span className="font-mono text-muted-foreground">
                      ({formatElapsed(elapsed)}
                      {avgDuration ? ` / 예상 ${formatElapsed(avgDuration)}` : ""})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    서버에서 실행 중 — 브라우저를 닫아도 작업이 계속됩니다
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── STEP 2: 댓글 승인 ────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              댓글 승인 ({pending.length}건)
            </CardTitle>
            {pending.length > 1 && (
              <Button size="sm" onClick={handleBulkApprove} disabled={bulkApproving}>
                {bulkApproving ? "승인 중..." : "일괄 승인"}
              </Button>
            )}
          </div>
          <CardDescription>
            AI가 생성한 댓글을 확인하고 승인/거부합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              대기 중인 댓글이 없습니다
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        [{c.blog_id}]{" "}
                        {c.post_url ? (
                          <a
                            href={c.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {c.post_title || "제목 없음"}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            {c.post_title || "제목 없음"}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {timeAgo(c.created_at)} · {c.comment_text.length}자
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(c.id, "approve")}
                        disabled={processingIds.has(c.id)}
                      >
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (editingId === c.id) {
                            setEditingId(null);
                            setEditText("");
                          } else {
                            setEditingId(c.id);
                            setEditText(c.comment_text);
                          }
                        }}
                      >
                        {editingId === c.id ? "취소" : "수정"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => handleAction(c.id, "reject")}
                        disabled={processingIds.has(c.id)}
                      >
                        거부
                      </Button>
                    </div>
                  </div>

                  {editingId === c.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={5}
                        className="text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleEditSave(c.id)}
                          disabled={processingIds.has(c.id) || !editText.trim()}
                        >
                          저장
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {editText.length}자
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">&ldquo;{c.comment_text}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── STEP 3: 댓글 게시 ────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              3
            </span>
            댓글 게시 ({approvedComments.length}건)
          </CardTitle>
          <CardDescription>
            승인된 댓글을 네이버에 게시합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {approvedComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              게시 대기 중인 댓글이 없습니다
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {approvedComments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium min-w-0 truncate">
                        [{c.blog_id}]{" "}
                        {c.post_url ? (
                          <a
                            href={c.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {c.post_title || "제목 없음"}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            {c.post_title || "제목 없음"}
                          </span>
                        )}
                      </p>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        승인됨
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      &ldquo;{c.comment_text}&rdquo;
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => sendCommand("execute")}
                  disabled={sendingCommand || !!activeCommand}
                >
                  댓글 게시
                </Button>
                <Button
                  variant="outline"
                  onClick={() => sendCommand("retry")}
                  disabled={sendingCommand || !!activeCommand}
                >
                  재시도
                </Button>
              </div>
            </>
          )}

          {commandError && (isExecuteCommand || (!activeCommand && !isRunCommand)) && (
            <p className="text-sm text-red-500">{commandError}</p>
          )}

          {/* execute/retry 명령 진행 표시 */}
          {isExecuteCommand && activeCommand && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              {activeCommand.status === "pending" && (
                <p className="text-sm">
                  <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  대기 중: {COMMAND_LABELS[activeCommand.command]} 명령 전송됨...
                </p>
              )}
              {activeCommand.status === "running" && (
                <>
                  <p className="text-sm">
                    <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    진행 중: {COMMAND_LABELS[activeCommand.command]}...{" "}
                    <span className="font-mono text-muted-foreground">
                      ({formatElapsed(elapsed)})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    서버에서 실행 중 — 브라우저를 닫아도 작업이 계속됩니다
                  </p>
                </>
              )}
            </div>
          )}

          {/* 최근 완료 명령 */}
          {botCommands.filter((c) => c.status === "completed" || c.status === "failed").length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">최근 명령</p>
              {botCommands
                .filter((c) => c.status === "completed" || c.status === "failed")
                .slice(0, 3)
                .map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {timeAgo(c.created_at)}
                    </span>
                    <span>
                      {c.status === "completed" ? (
                        <span className="text-green-600">
                          {COMMAND_LABELS[c.command]} 완료
                        </span>
                      ) : (
                        <span className="text-red-500">
                          {COMMAND_LABELS[c.command]} 실패
                        </span>
                      )}
                    </span>
                    <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {c.status === "completed" && c.result
                        ? (c.result as Record<string, unknown>).message as string || ""
                        : c.error_message || ""}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 댓글 내역 ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>댓글 내역</CardTitle>
          <CardDescription>승인/거부/게시된 댓글 처리 이력</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {HISTORY_TABS.map((tab) => (
              <Button
                key={tab.key}
                size="sm"
                variant={historyTab === tab.key ? "default" : "outline"}
                onClick={() => setHistoryTab(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {historyLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">내역이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {history.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border px-3 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium min-w-0 truncate">
                      [{c.blog_id}]{" "}
                      {c.post_url ? (
                        <a
                          href={c.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {c.post_title || "제목 없음"}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">
                          {c.post_title || "제목 없음"}
                        </span>
                      )}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      {STATUS_LABELS[c.status] && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[c.status].className}`}
                        >
                          {STATUS_LABELS[c.status].label}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(c.created_at)}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    &ldquo;{c.comment_text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 네이버 쿠키 (접기/펼치기) ──────────── */}
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
                  {cookieStatus.cookieCount}개 쿠키 · {cookieStatus.uploadedAt ? timeAgo(cookieStatus.uploadedAt) : ""}
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
                마지막 업로드: {timeAgo(cookieStatus.uploadedAt)}{" "}
                ({cookieStatus.cookieCount}개 쿠키)
              </div>
            )}
            <Textarea
              placeholder='EditThisCookie 등에서 내보낸 JSON을 여기에 붙여넣기...'
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
              Chrome &quot;EditThisCookie&quot; 확장 설치 &rarr; naver.com 로그인 &rarr;
              확장 아이콘 클릭 &rarr; Export &rarr; 여기에 붙여넣기
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── 설정 (접기/펼치기) ────────────────────── */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>설정</CardTitle>
              {!settingsOpen && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {settingsDraft.naver_blog_id || "블로그 미설정"} | {settingsDraft.approval_mode === "manual" ? "수동 승인" : "자동"} | 평일 {settingsDraft.weekday_hours.start}~{settingsDraft.weekday_hours.end}시
                </p>
              )}
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                settingsOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </CardHeader>
        {settingsOpen && (
          <CardContent className="space-y-4">
            {/* 블로그 ID 미설정 안내 */}
            {!settingsDraft.naver_blog_id && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                봇을 실행하려면 먼저 &quot;내 네이버 블로그 ID&quot;를 설정해야 합니다.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">
                  내 네이버 블로그 ID
                </label>
                <Input
                  placeholder="예: youyoubear0517"
                  value={settingsDraft.naver_blog_id || ""}
                  onChange={(e) =>
                    setSettingsDraft((s) => ({
                      ...s,
                      naver_blog_id: e.target.value || null,
                    }))
                  }
                  className="mt-1 w-64"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  blog.naver.com/<strong>여기ID</strong> 형식의 블로그 주소에서 확인
                  {settingsDraft.naver_blog_id && cookieStatus?.hasCookies && (
                    <span className="ml-2 text-green-600 font-medium">
                      &#10003; 자동 감지: {settingsDraft.naver_blog_id}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">모드</label>
                <select
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={settingsDraft.approval_mode}
                  onChange={(e) =>
                    setSettingsDraft((s) => ({
                      ...s,
                      approval_mode: e.target.value,
                    }))
                  }
                >
                  <option value="manual">수동 승인</option>
                  <option value="auto">자동</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={settingsDraft.is_active}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({
                        ...s,
                        is_active: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  봇 활성화
                </label>
              </div>

              <div>
                <label className="text-sm font-medium">
                  평일 시간대
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={settingsDraft.weekday_hours.start}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({
                        ...s,
                        weekday_hours: {
                          ...s.weekday_hours,
                          start: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">시 ~</span>
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={settingsDraft.weekday_hours.end}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({
                        ...s,
                        weekday_hours: {
                          ...s.weekday_hours,
                          end: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">시</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  주말 시간대
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={settingsDraft.weekend_hours.start}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({
                        ...s,
                        weekend_hours: {
                          ...s.weekend_hours,
                          start: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">시 ~</span>
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={settingsDraft.weekend_hours.end}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({
                        ...s,
                        weekend_hours: {
                          ...s.weekend_hours,
                          end: Number(e.target.value),
                        },
                      }))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">시</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  일일 블로거 한도
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={settingsDraft.max_bloggers_per_day}
                  onChange={(e) =>
                    setSettingsDraft((s) => ({
                      ...s,
                      max_bloggers_per_day: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-32"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  일일 댓글 한도
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={settingsDraft.max_comments_per_day}
                  onChange={(e) =>
                    setSettingsDraft((s) => ({
                      ...s,
                      max_comments_per_day: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-32"
                />
              </div>
            </div>

            {/* 댓글 스타일 프롬프트 */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  댓글 스타일 프롬프트
                </label>
                {settingsDraft.comment_prompt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    onClick={() =>
                      setSettingsDraft((s) => ({ ...s, comment_prompt: null }))
                    }
                  >
                    기본값 복원
                  </Button>
                )}
              </div>
              <Textarea
                placeholder={DEFAULT_PROMPT_PLACEHOLDER}
                rows={10}
                value={settingsDraft.comment_prompt || ""}
                onChange={(e) =>
                  setSettingsDraft((s) => ({
                    ...s,
                    comment_prompt: e.target.value || null,
                  }))
                }
                className="mt-1 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                비워두면 기본 프롬프트를 사용합니다. AI가 댓글을 생성할 때 이 규칙을 따릅니다.
              </p>
            </div>

            <Button onClick={handleSaveSettings} disabled={settingsSaving}>
              {settingsSaving ? "저장 중..." : "설정 저장"}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── 최근 실행 이력 (접기/펼치기) ────────── */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setRunHistoryOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>최근 실행 이력</CardTitle>
              {!runHistoryOpen && runs.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  최근 {runs.length}건
                  {avgDuration ? ` · 평균 ${formatElapsed(avgDuration)}` : ""}
                </p>
              )}
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                runHistoryOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </CardHeader>
        {runHistoryOpen && (
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                실행 이력이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {runs.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {formatDateTime(r.run_at)}
                    </span>
                    <span>
                      {r.bloggers_visited}명 / {r.comments_written}댓글
                      {r.comments_failed > 0 && (
                        <span className="text-red-500">
                          {" "}
                          / {r.comments_failed}실패
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {r.duration_seconds != null
                        ? formatElapsed(r.duration_seconds)
                        : "-"}
                    </span>
                    {r.error_message && (
                      <span className="text-red-500" title={r.error_message}>
                        오류
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
