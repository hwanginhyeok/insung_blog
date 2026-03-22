"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CommandResult {
  id: string;
  command: string;
  status: string;
  result: {
    visited?: number;
    comments_generated?: number;
    neighbor_requests?: number;
    failed?: number;
    errors?: string[];
    message?: string;
  } | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

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

export function VisitResults() {
  const [commands, setCommands] = useState<CommandResult[]>([]);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [cmdRes, pendingRes] = await Promise.all([
      fetch("/api/bot/command?commands=visit_neighbors,discover_neighbors,discover_and_visit&limit=20").then((r) => r.json()),
      fetch("/api/bot/pending?status=pending&order=desc").then((r) => r.json()),
    ]);
    setCommands(cmdRes.commands || []);
    setPendingComments(pendingRes.comments || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/bot/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        setPendingComments((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleApproveAll() {
    for (const c of pendingComments) {
      await handleAction(c.id, "approve");
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
  }

  const COMMAND_LABELS: Record<string, string> = {
    discover_neighbors: "이웃 찾기",
    visit_neighbors: "이웃 방문",
    discover_and_visit: "찾기+방문",
  };

  const STATUS_STYLES: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
    pending: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="space-y-4">
      {/* 대기 댓글 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              대기 댓글 ({pendingComments.length}개)
            </CardTitle>
            {pendingComments.length > 0 && (
              <Button size="sm" onClick={handleApproveAll}>
                전체 승인
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {pendingComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              대기 중인 댓글이 없습니다
            </p>
          ) : (
            <div className="divide-y">
              {pendingComments.map((c) => (
                <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {c.blog_id}
                        </span>
                        <span>{timeAgo(c.created_at)}</span>
                      </div>
                      <a
                        href={c.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {c.post_title}
                      </a>
                      <p className="mt-1 text-sm">{c.comment_text}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleAction(c.id, "approve")}
                        disabled={actionLoading.has(c.id)}
                      >
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAction(c.id, "reject")}
                        disabled={actionLoading.has(c.id)}
                      >
                        거부
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 실행 이력 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">최근 실행 이력</CardTitle>
        </CardHeader>
        <CardContent>
          {commands.length === 0 ? (
            <p className="text-sm text-muted-foreground">실행 이력이 없습니다</p>
          ) : (
            <div className="divide-y">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {COMMAND_LABELS[cmd.command] || cmd.command}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[cmd.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {cmd.status}
                      </span>
                    </div>
                    {cmd.result && (
                      <p className="text-xs text-muted-foreground">
                        {cmd.result.message ||
                          `방문 ${cmd.result.visited || 0}명, 댓글 ${cmd.result.comments_generated || 0}개`}
                      </p>
                    )}
                    {cmd.error_message && (
                      <p className="text-xs text-red-500">{cmd.error_message}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(cmd.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
