"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

interface CommentRow {
  id: string;
  blog_id: string;
  post_title: string;
  comment_text: string;
  status: string;
  created_at: string;
}

interface PersonaRow {
  id: string;
  name: string;
  description: string | null;
  blog_id: string | null;
  is_default: boolean;
}

interface NeighborRow {
  id: string;
  blog_id: string;
  blog_name: string | null;
  neighbor_type: string;
}

interface BotRunRow {
  id: string;
  run_at: string;
  bloggers_visited: number;
  comments_written: number;
  comments_failed: number;
  duration_seconds: number | null;
  error_message: string | null;
}

interface BotStats {
  summary: {
    totalRuns: number;
    totalBloggers: number;
    totalComments: number;
    totalFailed: number;
    botStatus: "active" | "inactive" | "error";
    lastRunAt: string | null;
    isActive: boolean;
    approvalMode: string;
  };
  commentCounts: Record<string, number>;
  recentRuns: BotRunRow[];
}

type Tab = "comments" | "persona" | "neighbors" | "bot";

const STATUS_LABELS: Record<string, string> = {
  posted: "게시완료",
  approved: "승인",
  pending: "대기",
  rejected: "거부",
  failed: "실패",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserDetailModal({ userId, userName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("comments");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborRow[]>([]);
  const [neighborStats, setNeighborStats] = useState<Record<string, number>>({});
  const [botStats, setBotStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [commentsRes, personaRes, neighborsRes, botRes] = await Promise.all([
      fetch(`/api/admin/users/${userId}/comments`),
      fetch(`/api/admin/users/${userId}/persona`),
      fetch(`/api/admin/users/${userId}/neighbors`),
      fetch(`/api/admin/users/${userId}/bot-stats`),
    ]);

    if (commentsRes.ok) {
      const d = await commentsRes.json();
      setComments(d.comments || []);
    }
    if (personaRes.ok) {
      const d = await personaRes.json();
      setPersonas(d.personas || []);
    }
    if (neighborsRes.ok) {
      const d = await neighborsRes.json();
      setNeighbors(d.neighbors || []);
      setNeighborStats(d.stats?.byType || {});
    }
    if (botRes.ok) {
      setBotStats(await botRes.json());
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-3xl max-h-[80vh] overflow-auto rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{userName || userId.slice(0, 8)}</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>

        {/* 탭 */}
        <div className="mb-4 flex gap-1.5">
          {(
            [
              { key: "comments" as Tab, label: `댓글 (${comments.length})` },
              { key: "persona" as Tab, label: `페르소나 (${personas.length})` },
              { key: "neighbors" as Tab, label: `이웃 (${neighbors.length})` },
              { key: "bot" as Tab, label: `봇 이력 (${botStats?.summary.totalRuns || 0})` },
            ] as const
          ).map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "default" : "outline"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : (
          <>
            {/* 댓글 탭 */}
            {tab === "comments" && (
              <div className="space-y-2">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">댓글 이력 없음</p>
                ) : (
                  comments.slice(0, 30).map((c) => (
                    <div key={c.id} className="rounded border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          [{c.blog_id}] {c.post_title || "제목 없음"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(c.created_at)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-muted-foreground line-clamp-2">
                        {c.comment_text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 페르소나 탭 */}
            {tab === "persona" && (
              <div className="space-y-2">
                {personas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">페르소나 없음</p>
                ) : (
                  personas.map((p) => (
                    <Card key={p.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          {p.name}
                          {p.is_default && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                              기본
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {p.description || "설명 없음"}
                        </p>
                        {p.blog_id && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            블로그: {p.blog_id}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* 이웃 탭 */}
            {tab === "neighbors" && (
              <div className="space-y-3">
                <div className="flex gap-3 text-sm">
                  <span>서로이웃: {neighborStats.mutual || 0}</span>
                  <span>일방: {neighborStats.one_way_following || 0}</span>
                  <span>전체: {neighbors.length}</span>
                </div>
                {neighbors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">이웃 없음</p>
                ) : (
                  <div className="space-y-1">
                    {neighbors.slice(0, 30).map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                      >
                        <span>{n.blog_name || n.blog_id}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            n.neighbor_type === "mutual"
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {n.neighbor_type === "mutual" ? "서로이웃" : "일방"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 봇 이력 탭 */}
            {tab === "bot" && botStats && (
              <div className="space-y-4">
                {/* 요약 카드 */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded border p-3 text-center">
                    <p className="text-lg font-bold">{botStats.summary.totalRuns}</p>
                    <p className="text-xs text-muted-foreground">실행 횟수</p>
                  </div>
                  <div className="rounded border p-3 text-center">
                    <p className="text-lg font-bold">{botStats.summary.totalBloggers}</p>
                    <p className="text-xs text-muted-foreground">방문 블로거</p>
                  </div>
                  <div className="rounded border p-3 text-center">
                    <p className="text-lg font-bold text-green-600">{botStats.summary.totalComments}</p>
                    <p className="text-xs text-muted-foreground">작성 댓글</p>
                  </div>
                  <div className="rounded border p-3 text-center">
                    <p className="text-lg font-bold text-red-600">{botStats.summary.totalFailed}</p>
                    <p className="text-xs text-muted-foreground">실패</p>
                  </div>
                </div>

                {/* 상태 정보 */}
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    botStats.summary.botStatus === "active" ? "bg-green-100 text-green-700" :
                    botStats.summary.botStatus === "error" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {botStats.summary.botStatus === "active" ? "활성" :
                     botStats.summary.botStatus === "error" ? "에러" : "비활성"}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                    {botStats.summary.approvalMode === "auto" ? "자동 승인" : "수동 승인"}
                  </span>
                  {botStats.summary.lastRunAt && (
                    <span className="text-xs text-muted-foreground">
                      마지막 실행: {formatDate(botStats.summary.lastRunAt)}
                    </span>
                  )}
                </div>

                {/* 댓글 상태 분포 */}
                {Object.keys(botStats.commentCounts).length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(botStats.commentCounts).map(([status, count]) => (
                      <span key={status} className="rounded border px-2 py-0.5">
                        {STATUS_LABELS[status] || status}: {count}
                      </span>
                    ))}
                  </div>
                )}

                {/* 최근 실행 로그 */}
                <div className="space-y-1.5">
                  <h4 className="text-sm font-medium">최근 실행 (30일)</h4>
                  {botStats.recentRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">실행 이력 없음</p>
                  ) : (
                    botStats.recentRuns.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formatDate(r.run_at)}</span>
                          {r.error_message && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">에러</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>방문 {r.bloggers_visited}</span>
                          <span className="text-green-600">댓글 {r.comments_written}</span>
                          {r.comments_failed > 0 && (
                            <span className="text-red-600">실패 {r.comments_failed}</span>
                          )}
                          {r.duration_seconds != null && (
                            <span>{Math.round(r.duration_seconds / 60)}분</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
