// 서로이웃 API 호출 함수 + 타입

export interface Neighbor {
  id: string;
  user_id: string;
  blog_id: string;
  blog_name: string | null;
  neighbor_type: "mutual" | "one_way_following" | "one_way_follower";
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
