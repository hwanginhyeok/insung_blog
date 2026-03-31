"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BotCommandRecord,
  BotSettings,
  PendingComment,
  COMMAND_LABELS,
  formatElapsed,
  timeAgo,
} from "../_lib/bot-api";

// ── 에러 분류 ────────────────────────────────────────────────

type ErrorClass = {
  badge: string;
  badgeColor: string;
  remedy: string;
};

function classifyError(msg: string | null | undefined): ErrorClass {
  if (!msg) return { badge: "오류", badgeColor: "text-red-500", remedy: "로그를 확인하세요." };
  const m = msg.toLowerCase();
  if (m.includes("nid_aut") || m.includes("쿠키 만료") || m.includes("쿠키를 재업로드")) {
    return {
      badge: "쿠키 만료",
      badgeColor: "text-orange-600",
      remedy: "웹 대시보드 → [봇 설정] → 쿠키 업로드",
    };
  }
  if (m.includes("로그인 실패") || m.includes("login") || m.includes("인증")) {
    return {
      badge: "로그인 실패",
      badgeColor: "text-orange-600",
      remedy: "쿠키를 재업로드하거나 봇을 재시작하세요.",
    };
  }
  if (
    m.includes("셀렉터") ||
    m.includes("제출 버튼") ||
    m.includes("입력창") ||
    m.includes("selector")
  ) {
    return {
      badge: "셀렉터 오류",
      badgeColor: "text-yellow-600",
      remedy: "네이버 DOM 변경 가능성 — 개발자 확인 필요",
    };
  }
  if (m.includes("연속") && m.includes("실패")) {
    return {
      badge: "연속 실패",
      badgeColor: "text-yellow-600",
      remedy: "잠시 후 재시도하거나 쿠키 상태를 확인하세요.",
    };
  }
  if (m.includes("timeout") || m.includes("타임아웃")) {
    return {
      badge: "타임아웃",
      badgeColor: "text-yellow-600",
      remedy: "네트워크 상태를 확인하고 재시도하세요.",
    };
  }
  return { badge: "오류", badgeColor: "text-red-500", remedy: "로그를 확인하세요." };
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
  onSendCommand: (command: "run" | "execute" | "retry") => void;
  onConfirmRun: () => void;
  onCancelRunWarning: () => void;
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
}: BotControlPanelProps) {
  // 현재 단계 결정
  function getCurrentStep(): number {
    if (
      activeCommand?.command === "run" &&
      (activeCommand.status === "pending" || activeCommand.status === "running")
    )
      return 1;
    if (
      (activeCommand?.command === "execute" || activeCommand?.command === "retry") &&
      (activeCommand.status === "pending" || activeCommand.status === "running")
    )
      return 3;
    if (pending.length > 0) return 2;
    if (approvedComments.length > 0) return 3;
    return 1;
  }

  const currentStep = getCurrentStep();
  const isRunCommand = activeCommand?.command === "run";
  const isExecuteCommand =
    activeCommand?.command === "execute" || activeCommand?.command === "retry";

  return (
    <>
      {/* ── 3단계 플로우 Stepper ─────────────────── */}
      <Card>
        <CardContent className="pt-6 pb-4">
          <Stepper currentStep={currentStep} />
        </CardContent>
      </Card>

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
                  onClick={onConfirmRun}
                >
                  그래도 실행
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelRunWarning}>
                  취소
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={onRunClick}
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

          {commandError &&
            activeCommand?.command !== "execute" &&
            activeCommand?.command !== "retry" && (
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

      {/* ── STEP 3: 댓글 게시 ────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              3
            </span>
            댓글 게시 ({approvedComments.length}건)
          </CardTitle>
          <CardDescription>승인된 댓글을 네이버에 게시합니다</CardDescription>
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
                  <div key={c.id} className="rounded-lg border px-3 py-2 space-y-1">
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
                  onClick={() => onSendCommand("execute")}
                  disabled={sendingCommand || !!activeCommand}
                >
                  댓글 게시
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onSendCommand("retry")}
                  disabled={sendingCommand || !!activeCommand}
                >
                  재시도
                </Button>
              </div>
            </>
          )}

          {commandError &&
            (isExecuteCommand || (!activeCommand && !isRunCommand)) && (
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
                  {activeCommand.result?.progress != null && (
                    <div className="space-y-1">
                      <p className="text-sm font-mono">
                        {activeCommand.result.progress as number}/{activeCommand.result.total as number}개 처리
                        <span className="ml-2 text-green-600">
                          성공 {activeCommand.result.success as number}
                        </span>
                        <span className="ml-1 text-red-500">
                          실패 {activeCommand.result.failed as number}
                        </span>
                      </p>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.round(((activeCommand.result.progress as number) / (activeCommand.result.total as number)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    서버에서 실행 중 — 브라우저를 닫아도 작업이 계속됩니다
                  </p>
                </>
              )}
            </div>
          )}

          {/* 최근 완료 명령 */}
          {botCommands.filter(
            (c) => c.status === "completed" || c.status === "failed"
          ).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">최근 명령</p>
              {botCommands
                .filter((c) => c.status === "completed" || c.status === "failed")
                .slice(0, 3)
                .map((c) => (
                  <div
                    key={c.id}
                    className="rounded border px-3 py-2 text-sm"
                  >
                    {/* 1행: 시간 + 명령 결과 + 배지 (모바일: 2줄) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs text-muted-foreground">
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
                      {c.status === "failed" && (
                        <span
                          className={`text-xs font-medium ${classifyError(c.error_message).badgeColor}`}
                        >
                          [{classifyError(c.error_message).badge}]
                        </span>
                      )}
                      {c.status === "completed" && c.result && (
                        <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                          {((c.result as Record<string, unknown>).message as string) || ""}
                        </span>
                      )}
                    </div>
                    {/* 2행: 실패 시 원인 + 조치 방안 */}
                    {c.status === "failed" && (
                      <div className="mt-1 space-y-0.5">
                        <p
                          className="text-xs text-muted-foreground"
                          title={c.error_message ?? ""}
                        >
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
    </>
  );
}
