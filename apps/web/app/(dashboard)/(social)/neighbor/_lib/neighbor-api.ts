// 서로이웃 API 호출 함수 + 타입

export interface Neighbor {
  id: string;
  user_id: string;
  blog_id: string;
  blog_name: string | null;
  neighbor_type: "mutual" | "one_way_following" | "one_way_follower" | "discovered";
  category: string | null;
  last_interaction_at: string | null;
  created_at: string;
}

export interface NeighborRequest {
  id: string;
  user_id: string;
  target_blog_id: string;
  target_blog_name: string | null;
  status: "sent" | "accepted" | "rejected" | "cancelled";
  message: string | null;
  requested_at: string;
  responded_at: string | null;
}

export interface NeighborInteraction {
  id: string;
  user_id: string;
  blog_id: string;
  interaction_type: "comment_sent" | "comment_received" | "visit";
  post_url: string | null;
  content: string | null;
  created_at: string;
}

export interface NeighborRecommendation {
  id: string;
  blog_id: string;
  blog_name: string | null;
  category: string | null;
  reason: string | null;
  score: number;
  status: "pending" | "applied" | "dismissed";
  created_at: string;
}

export interface NeighborStats {
  neighbors: {
    total: number;
    byType: { mutual: number; one_way_following: number; one_way_follower: number };
  };
  requests: {
    total: number;
    byStatus: { sent: number; accepted: number; rejected: number; cancelled: number };
  };
  interactions: {
    total: number;
  };
}

export async function fetchNeighborStats(): Promise<NeighborStats | null> {
  const res = await fetch("/api/neighbor/stats");
  if (!res.ok) return null;
  return res.json();
}

export async function fetchNeighborList(type?: string): Promise<Neighbor[]> {
  const url = type ? `/api/neighbor/list?type=${type}` : "/api/neighbor/list";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.neighbors || [];
}

export async function fetchNeighborRequests(status?: string): Promise<NeighborRequest[]> {
  const url = status
    ? `/api/neighbor/requests?status=${status}`
    : "/api/neighbor/requests";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.requests || [];
}

export async function fetchInteractions(blogId?: string): Promise<NeighborInteraction[]> {
  const url = blogId
    ? `/api/neighbor/interactions?blog_id=${blogId}`
    : "/api/neighbor/interactions";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.interactions || [];
}

export async function fetchRecommendations(): Promise<NeighborRecommendation[]> {
  const res = await fetch("/api/neighbor/recommendations");
  if (!res.ok) return [];
  const data = await res.json();
  return data.recommendations || [];
}

export async function sendNeighborRequest(
  targetBlogId: string,
  targetBlogName?: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/neighbor/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetBlogId, targetBlogName, message }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error };
  return { success: true };
}

export async function updateRecommendation(
  id: string,
  status: "applied" | "dismissed"
): Promise<boolean> {
  const res = await fetch("/api/neighbor/recommendations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  return res.ok;
}

// ── 블로그 테마 ──

export async function fetchBlogThemes(): Promise<string[]> {
  const res = await fetch("/api/neighbor/themes");
  if (!res.ok) return [];
  const data = await res.json();
  return data.themes || [];
}

export async function saveBlogThemes(themes: string[]): Promise<boolean> {
  const res = await fetch("/api/neighbor/themes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themes }),
  });
  return res.ok;
}

// ── 이웃 새글 피드 댓글 ──

export async function sendFeedComment(): Promise<{
  success: boolean;
  error?: string;
}> {
  const res = await fetch("/api/bot/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "feed_comment" }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error };
  return { success: true };
}

// ── 이웃 발견/방문 명령 ──

export async function sendDiscoverNeighbors(
  keywords: string[]
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/bot/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command: "discover_neighbors",
      payload: { keywords },
    }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error };
  return { success: true };
}

export async function sendVisitNeighbors(): Promise<{
  success: boolean;
  error?: string;
}> {
  const res = await fetch("/api/bot/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: "visit_neighbors" }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error };
  return { success: true };
}

export async function sendDiscoverAndVisit(
  keywords: string[]
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/bot/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command: "discover_and_visit",
      payload: { keywords },
    }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error };
  return { success: true };
}

// ── 이웃 신청 메시지 커스텀 ──

export async function fetchNeighborRequestMessage(): Promise<string> {
  const res = await fetch("/api/bot/settings");
  if (!res.ok) return "";
  const data = await res.json();
  return data.neighbor_request_message || "";
}

export async function saveNeighborRequestMessage(
  message: string,
): Promise<boolean> {
  const res = await fetch("/api/bot/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ neighbor_request_message: message }),
  });
  return res.ok;
}

export interface BotCommandStatus {
  id: string;
  command: string;
  status: "pending" | "running" | "completed" | "failed";
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export async function fetchCommandStatus(): Promise<{
  activeCommand: BotCommandStatus | null;
}> {
  const res = await fetch("/api/bot/command");
  if (!res.ok) return { activeCommand: null };
  return res.json();
}
