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

type Tab = "comments" | "persona" | "neighbors";

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
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [commentsRes, personaRes, neighborsRes] = await Promise.all([
      fetch(`/api/admin/users/${userId}/comments`),
      fetch(`/api/admin/users/${userId}/persona`),
      fetch(`/api/admin/users/${userId}/neighbors`),
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
          </>
        )}
      </div>
    </div>
  );
}
