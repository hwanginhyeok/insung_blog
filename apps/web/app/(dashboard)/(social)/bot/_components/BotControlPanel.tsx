"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BotCommandRecord,
  BotSettings,
  PendingComment,
  ProgressResult,
  COMMAND_LABELS,
  formatElapsed,
  timeAgo,
  isProgressResult,
} from "../_lib/bot-api";

// ── 진행률 바 ─────────────────────────────────────────────────

function ProgressBar({ result }: { result: ProgressResult }) {
  const { progress, total, success, failed, fail_reasons } = result;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  const reasonParts: string[] = [];
  if (fail_reasons) {
    if (fail_reasons.cookie > 0) reasonParts.push(`쿠키 만료 ${fail_reasons.cookie}건`);
    if (fail_reasons.no_input > 0) reasonParts.push(`댓글창 미탐지 ${fail_reasons.no_input}건`);
    if (fail_reasons.other > 0) reasonParts.push(`기타 ${fail_reasons.other}건`);
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-mono">
        {progress}/{total}개 처리
        <span className="ml-2 text-green-600">성공 {success}</span>
        <span className="ml-1 text-red-500">실패 {failed}</span>
      </p>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {reasonParts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {reasonParts.join(" / ")}
        </p>
      )}
    </div>
  );
}

// ── 에러 분류 ────────────────────────────────────────────────

type ErrorClass = { badge: string; badgeColor: string; remedy: string };

function classifyError(msg: string | null | undefined): ErrorClass {
  if (!msg) return { badge: "오류", badgeColor: "text-red-500", remedy: "로그를 확인하세요." };
  const m = msg.toLowerCase();
  if (m.includes("nid_aut") || m.includes("쿠키 만료") || m.includes("쿠키를 재업로드"))
    return { badge: "쿠키 만료", badgeColor: "text-orange-600", remedy: "웹 대시보드 → [봇 설정] → 쿠키 업로드" };
  if (m.includes("로그인 실패") || m.includes("login") || m.includes("인증"))
    return { badge: "로그인 실패", badgeColor: "text-orange-600", remedy: "쿠키를 재업로드하거나 봇을 재시작하세요." };
  if (m.includes("셀렉터") || m.includes("제출 버튼") || m.includes("입력창") || m.includes("selector"))
    return { badge: "셀렉터 오류", badgeColor: "text-yellow-600", remedy: "네이버 DOM 변경 가능성 — 개발자 확인 필요" };
  if (m.includes("timeout") || m.includes("타임아웃"))
    return { badge: "타임아웃", badgeColor: "text-yellow-600", remedy: "네트워크 상태를 확인하고 재시도하세요." };
  return { badge: "오류", badgeColor: "text-red-500", remedy: "로그를 확인하세요." };
}

// ── Props ────────────────────────────────────────────────────

interface BotControlPanelProps {
  pending: PendingComment[];
  approvedComments: PendingComment[];
  settings: BotSettings;
  activeCommand: BotCommandRecord | null;
  botCommands: BotCommandRecord[];
  sendingCommand: boolean;
  commandError: string | null;
  elapsed: number;
  avgDuration: number | null;
  showRunWarning: boolean;
  onRunClick: () => void;
  onSendCommand: (command: "run" | "execute" | "retry" | "auto_reply") => void;
  onConfirmRun: () => void;
  onCancelRunWarning: () => void;
  onSaveSettingsPatch?: (patch: Partial<BotSettings>) => Promise<void>;
}

export function BotControlPanel({
  pending,
  approvedComments,
  settings,
  activeCommand,
  botCommands,
  sendingCommand,
  commandError,
  elapsed,
  avgDuration,
  showRunWarning,
  onRunClick,
  onSendCommand,
  onConfirmRun,
  onCancelRunWarning,
  onSaveSettingsPatch,
}: BotControlPanelProps) {
  const isDisabled = sendingCommand || !!activeCommand || !settings.naver_blog_id;
  const isRunning = activeCommand?.status === "running" || activeCommand?.status === "pending";
  const runningCommand = activeCommand?.command;

  return (
    <div className="space-y-3">
      {/* ── 액션 바: 모든 기능 버튼 ─────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          {/* 버튼 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* 1. 봇 실행 */}
            <button
              onClick={onRunClick}
              disabled={isDisabled}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all ${
                runningCommand === "run" && isRunning
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/50 hover:bg-accent"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-2xl">
                {runningCommand === "run" && isRunning ? "⏳" : "🔍"}
              </span>
              <span className="text-sm font-semibold">봇 실행</span>
              <span className="text-[11px] text-muted-foreground">댓글 수집</span>
              {settings.daily_discover && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-green-500" title="자동 수집 ON" />
              )}
            </button>

            {/* 2. 댓글 승인 — 아래 승인 영역으로 스크롤 */}
            <button
              onClick={() => {
                document.getElementById("comment-approval")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all ${
                pending.length > 0
                  ? "border-yellow-400 bg-yellow-50"
                  : "border-border hover:border-primary/50 hover:bg-accent"
              }`}
            >
              <span className="text-2xl">
                {pending.length > 0 ? "📋" : "✅"}
              </span>
              <span className="text-sm font-semibold">댓글 승인</span>
              <span className="text-[11px] text-muted-foreground">
                {pending.length > 0 ? `${pending.length}건 대기` : "대기 없음"}
              </span>
              {pending.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-white">
                  {pending.length}
                </span>
              )}
            </button>

            {/* 3. 댓글 게시 */}
            <button
              onClick={() => onSendCommand("execute")}
              disabled={isDisabled || approvedComments.length === 0}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all ${
                runningCommand === "execute" && isRunning
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : approvedComments.length > 0
                    ? "border-blue-400 bg-blue-50 hover:border-blue-500"
                    : "border-border hover:border-primary/50 hover:bg-accent"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-2xl">
                {runningCommand === "execute" && isRunning ? "⏳" : "📤"}
              </span>
              <span className="text-sm font-semibold">댓글 게시</span>
              <span className="text-[11px] text-muted-foreground">
                {approvedComments.length > 0 ? `${approvedComments.length}건 준비` : "승인 필요"}
              </span>
              {approvedComments.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  {approvedComments.length}
                </span>
              )}
            </button>

            {/* 4. 대댓글 답글 */}
            <button
              onClick={() => onSendCommand("auto_reply")}
              disabled={isDisabled}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all ${
                runningCommand === "auto_reply" && isRunning
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/50 hover:bg-accent"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-2xl">
                {runningCommand === "auto_reply" && isRunning ? "⏳" : "💬"}
              </span>
              <span className="text-sm font-semibold">대댓글</span>
              <span className="text-[11px] text-muted-foreground">내 글 답글</span>
            </button>
          </div>

          {/* 토글 옵션들 */}
          {onSaveSettingsPatch && (
            <div className="flex flex-wrap items-center gap-4 pt-1 border-t">
              <label className="flex cursor-pointer items-center gap-2 text-sm pt-2">
                <button
                  role="switch"
                  aria-checked={settings.daily_discover}
                  onClick={() => onSaveSettingsPatch({ daily_discover: !settings.daily_discover })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    settings.daily_discover ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    settings.daily_discover ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-muted-foreground">
                  매일 자동 수집
                  {settings.daily_discover && <span className="ml-1 text-xs text-primary">오전 9시</span>}
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm pt-2">
                <button
                  role="switch"
                  aria-checked={settings.auto_execute}
                  onClick={() => onSaveSettingsPatch({ auto_execute: !settings.auto_execute })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    settings.auto_execute ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    settings.auto_execute ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-muted-foreground">자동 게시</span>
              </label>
            </div>
          )}

          {/* 재실행 경고 */}
          {showRunWarning && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-2">
              <p className="text-sm text-yellow-800">
                승인 대기 {pending.length}건, 게시 대기 {approvedComments.length}건이 있습니다.
                봇을 다시 실행하면 새로운 댓글이 추가됩니다.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-800 hover:bg-yellow-100" onClick={onConfirmRun}>
                  그래도 실행
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelRunWarning}>취소</Button>
              </div>
            </div>
          )}

          {/* 진행 표시 (실행 중인 명령) */}
          {activeCommand && isRunning && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-sm">
                <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                {COMMAND_LABELS[activeCommand.command] || activeCommand.command} 진행 중...{" "}
                <span className="font-mono text-muted-foreground">
                  ({formatElapsed(elapsed)}
                  {activeCommand.command === "run" && avgDuration ? ` / 예상 ${formatElapsed(avgDuration)}` : ""})
                </span>
              </p>
              {isProgressResult(activeCommand.result) && (
                <ProgressBar result={activeCommand.result} />
              )}
              <p className="text-xs text-muted-foreground">
                서버에서 실행 중 — 브라우저를 닫아도 작업이 계속됩니다
              </p>
            </div>
          )}

          {/* 에러 표시 */}
          {commandError && (
            <p className="text-sm text-red-500">{commandError}</p>
          )}

          {/* 최근 완료 명령 */}
          {botCommands.filter((c) => c.status === "completed" || c.status === "failed").length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">최근 명령</p>
              {botCommands
                .filter((c) => c.status === "completed" || c.status === "failed")
                .slice(0, 3)
                .map((c) => (
                  <div key={c.id} className="rounded border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                      <span>
                        {c.status === "completed" ? (
                          <span className="text-green-600">{COMMAND_LABELS[c.command]} 완료</span>
                        ) : (
                          <span className="text-red-500">{COMMAND_LABELS[c.command]} 실패</span>
                        )}
                      </span>
                      {c.status === "failed" && (
                        <span className={`text-xs font-medium ${classifyError(c.error_message).badgeColor}`}>
                          [{classifyError(c.error_message).badge}]
                        </span>
                      )}
                      {c.status === "completed" && c.result && "message" in c.result && (
                        <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                          {(c.result as { message: string }).message || ""}
                        </span>
                      )}
                    </div>
                    {c.status === "failed" && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-muted-foreground" title={c.error_message ?? ""}>
                          {c.error_message || "알 수 없는 오류"}
                        </p>
                        <p className="text-xs font-medium text-blue-600">
                          → {classifyError(c.error_message).remedy}
                        </p>
                      </div>
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
