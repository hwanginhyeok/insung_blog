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
};

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

// ── 컴포넌트 ─────────────────────────────────────────────────

export default function BotPage() {
  const [pending, setPending] = useState<PendingComment[]>([]);
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
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<BotSettings>(defaultSettings);
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [cookieJson, setCookieJson] = useState("");
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 봇 명령 제어
  const [botCommands, setBotCommands] = useState<BotCommandRecord[]>([]);
  const [activeCommand, setActiveCommand] = useState<BotCommandRecord | null>(null);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // 데이터 로드
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, pendingRes, cookieRes] = await Promise.all([
        fetch("/api/bot/status"),
        fetch("/api/bot/pending"),
        fetch("/api/bot/cookies"),
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
        setCookieStatus(await cookieRes.json());
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
        setCookieMsg({ type: "ok", text: `${data.cookieCount}개 쿠키 업로드 완료` });
        setCookieJson("");
        // 상태 새로고침
        const refreshRes = await fetch("/api/bot/cookies");
        if (refreshRes.ok) setCookieStatus(await refreshRes.json());
      } else {
        setCookieMsg({ type: "err", text: data.error || "업로드 실패" });
      }
    } catch {
      setCookieMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setCookieUploading(false);
    }
  }

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
            <CardDescription>승인 대기</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{pendingCount}건</p>
            <p className="text-sm text-muted-foreground">
              {settings.approval_mode === "manual" ? "수동 승인 모드" : "자동 모드"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── 봇 제어 ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>봇 제어</CardTitle>
          <CardDescription>
            로컬 워커에 명령을 전송합니다 (10초 이내 실행)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => sendCommand("run")}
              disabled={sendingCommand || !!activeCommand}
            >
              {sendingCommand ? "전송 중..." : "봇 실행"}
            </Button>
            <Button
              variant="outline"
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

          {commandError && (
            <p className="text-sm text-red-500">{commandError}</p>
          )}

          {/* 활성 명령 상태 */}
          {activeCommand && (
            <div className="rounded-lg border bg-muted/30 p-3">
              {activeCommand.status === "pending" && (
                <p className="text-sm">
                  <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  대기 중: {COMMAND_LABELS[activeCommand.command] || activeCommand.command}...
                </p>
              )}
              {activeCommand.status === "running" && (
                <p className="text-sm">
                  <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  진행 중: {COMMAND_LABELS[activeCommand.command] || activeCommand.command}...{" "}
                  <span className="font-mono text-muted-foreground">({elapsed}초 경과)</span>
                </p>
              )}
            </div>
          )}

          {/* 최근 완료 명령 */}
          {botCommands.length > 0 && (
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

      {/* ── 네이버 쿠키 ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>네이버 로그인 쿠키</CardTitle>
          <CardDescription>
            브라우저에서 네이버 로그인 후 쿠키를 내보내 업로드하세요
          </CardDescription>
        </CardHeader>
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
      </Card>

      {/* ── 승인 대기 ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>승인 대기 ({pending.length}건)</CardTitle>
            {pending.length > 1 && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleBulkApprove} disabled={bulkApproving}>
                  {bulkApproving ? "승인 중..." : "일괄 승인"}
                </Button>
              </div>
            )}
          </div>
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
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      [{c.blog_id}]{" "}
                      <span className="text-muted-foreground">
                        {c.post_title || "제목 없음"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm">&ldquo;{c.comment_text}&rdquo;</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timeAgo(c.created_at)}
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
                      onClick={() => handleAction(c.id, "reject")}
                      disabled={processingIds.has(c.id)}
                    >
                      거부
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 설정 ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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

          <Button onClick={handleSaveSettings} disabled={settingsSaving}>
            {settingsSaving ? "저장 중..." : "설정 저장"}
          </Button>
        </CardContent>
      </Card>

      {/* ── 최근 실행 이력 ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>최근 실행 이력</CardTitle>
        </CardHeader>
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
                      ? `${r.duration_seconds}초`
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
      </Card>
    </div>
  );
}
