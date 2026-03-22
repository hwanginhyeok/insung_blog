// ── 타입 ──────────────────────────────────────────────────────

export interface PendingComment {
  id: string;
  blog_id: string;
  post_url: string;
  post_title: string;
  comment_text: string;
  ai_generated: boolean;
  status: string;
  created_at: string;
}

export interface RunLog {
  id: string;
  run_at: string;
  bloggers_visited: number;
  comments_written: number;
  comments_failed: number;
  pending_count: number;
  error_message: string | null;
  duration_seconds: number | null;
}

export interface BotSettings {
  approval_mode: string;
  is_active: boolean;
  weekday_hours: { start: number; end: number };
  weekend_hours: { start: number; end: number };
  max_comments_per_day: number;
  max_bloggers_per_day: number;
  naver_blog_id: string | null;
  comment_prompt: string | null;
  auto_neighbor_request: boolean;
  max_neighbor_requests_per_day: number;
  neighbor_request_message: string | null;
}

export interface TodayStats {
  bloggers: number;
  comments: number;
  failed: number;
}

export interface CookieStatus {
  hasCookies: boolean;
  uploadedAt?: string;
  cookieCount?: number;
}

export interface BotCommandRecord {
  id: string;
  command: "run" | "execute" | "retry";
  status: "pending" | "running" | "completed" | "failed";
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BotStatusResponse {
  recentRuns: RunLog[];
  settings: BotSettings | null;
  pendingCount: number;
  todayStats: TodayStats;
}

export interface CommandsResponse {
  commands: BotCommandRecord[];
  activeCommand: BotCommandRecord | null;
}

// ── 상수 ──────────────────────────────────────────────────────

export const COMMAND_LABELS: Record<string, string> = {
  run: "봇 실행",
  execute: "댓글 게시",
  retry: "재시도",
};

export const defaultSettings: BotSettings = {
  approval_mode: "manual",
  is_active: true,
  weekday_hours: { start: 20, end: 24 },
  weekend_hours: { start: 13, end: 18 },
  max_comments_per_day: 30,
  max_bloggers_per_day: 10,
  naver_blog_id: null,
  comment_prompt: null,
  auto_neighbor_request: false,
  max_neighbor_requests_per_day: 10,
  neighbor_request_message: "",
};

export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  approved: { label: "승인", className: "bg-blue-100 text-blue-700" },
  posted: { label: "게시완료", className: "bg-green-100 text-green-700" },
  rejected: { label: "거부", className: "bg-gray-100 text-gray-600" },
  failed: { label: "실패", className: "bg-red-100 text-red-700" },
};

export const HISTORY_TABS = [
  { key: "all", label: "전체" },
  { key: "approved", label: "승인" },
  { key: "posted", label: "게시완료" },
  { key: "rejected", label: "거부" },
  { key: "failed", label: "실패" },
] as const;

export const DEFAULT_PROMPT_PLACEHOLDER = `말투와 스타일:
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

// ── 유틸 함수 ─────────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0 || isNaN(diff)) return "방금 전";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

// ── API 호출 함수 ──────────────────────────────────────────────

export async function apiFetchStatus(): Promise<BotStatusResponse> {
  const res = await fetch("/api/bot/status");
  if (!res.ok) throw new Error("상태 조회 실패");
  return res.json();
}

export async function apiFetchPending(status = "pending"): Promise<{ comments: PendingComment[] }> {
  const res = await fetch(`/api/bot/pending?status=${status}`);
  if (!res.ok) throw new Error("대기 댓글 조회 실패");
  return res.json();
}

export async function apiFetchPendingHistory(
  status: string,
  limit = 50
): Promise<{ comments: PendingComment[] }> {
  const res = await fetch(
    `/api/bot/pending?status=${status}&order=desc&limit=${limit}`
  );
  if (!res.ok) throw new Error("댓글 내역 조회 실패");
  return res.json();
}

export async function apiFetchCookieStatus(): Promise<CookieStatus> {
  const res = await fetch("/api/bot/cookies");
  if (!res.ok) throw new Error("쿠키 상태 조회 실패");
  return res.json();
}

export async function apiFetchCommands(): Promise<CommandsResponse> {
  const res = await fetch("/api/bot/command");
  if (!res.ok) throw new Error("명령 조회 실패");
  return res.json();
}

export async function apiSendCommand(
  command: "run" | "execute" | "retry"
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/bot/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || "명령 전송 실패" };
  return { success: true };
}

export async function apiApprovePendingComment(
  id: string,
  action: "approve" | "reject"
): Promise<boolean> {
  const res = await fetch("/api/bot/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action }),
  });
  return res.ok;
}

export async function apiEditPendingComment(
  id: string,
  comment_text: string
): Promise<boolean> {
  const res = await fetch("/api/bot/pending", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, comment_text }),
  });
  return res.ok;
}

export async function apiSaveSettings(
  settings: BotSettings
): Promise<{ success: boolean; settings?: BotSettings; error?: string }> {
  const res = await fetch("/api/bot/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || "설정 저장 실패" };
  return { success: true, settings: data.settings };
}

export async function apiUploadCookies(
  cookieData: unknown[]
): Promise<{ success: boolean; cookieCount?: number; error?: string }> {
  const res = await fetch("/api/bot/cookies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cookieData }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || "업로드 실패" };
  return { success: true, cookieCount: data.cookieCount };
}
