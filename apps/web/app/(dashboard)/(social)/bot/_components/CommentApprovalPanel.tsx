"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  PendingComment,
  timeAgo,
  apiApprovePendingComment,
  apiEditPendingComment,
} from "../_lib/bot-api";

interface CommentApprovalPanelProps {
  pending: PendingComment[];
  approvedComments: PendingComment[];
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
  onRevoked: (id: string) => void;
  onEdited: (id: string, newText: string) => void;
  onBulkApproved: () => void;
}

export function CommentApprovalPanel({
  pending,
  approvedComments,
  onApproved,
  onRejected,
  onRevoked,
  onEdited,
  onBulkApproved,
}: CommentApprovalPanelProps) {
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);

  function addProcessing(id: string) {
    setProcessingIds((prev) => new Set(prev).add(id));
  }

  function removeProcessing(id: string) {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    addProcessing(id);
    try {
      const ok = await apiApprovePendingComment(id, action);
      if (ok) {
        if (action === "approve") {
          onApproved(id);
        } else {
          onRejected(id);
        }
      }
    } finally {
      removeProcessing(id);
    }
  }

  async function handleBulkApprove() {
    setBulkApproving(true);
    try {
      const results = await Promise.allSettled(
        pending.map((c) => handleAction(c.id, "approve"))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`일괄 승인: ${failed}건 실패`);
      }
      onBulkApproved();
    } finally {
      setBulkApproving(false);
    }
  }

  async function handleEditSave(id: string) {
    if (!editText.trim()) return;
    addProcessing(id);
    try {
      const ok = await apiEditPendingComment(id, editText);
      if (ok) {
        onEdited(id, editText.trim());
        setEditingId(null);
        setEditText("");
      }
    } finally {
      removeProcessing(id);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            댓글 승인 ({pending.length}건)
          </CardTitle>
          <div className="flex gap-1.5">
            {pending.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCommentsCollapsed(!commentsCollapsed)}
              >
                {commentsCollapsed ? "펼치기" : "접기"}
              </Button>
            )}
            {pending.length > 1 && (
              <Button size="sm" onClick={handleBulkApprove} disabled={bulkApproving}>
                {bulkApproving ? "승인 중..." : "일괄 승인"}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          AI가 생성한 댓글을 확인하고 승인/거부합니다
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">대기 중인 댓글이 없습니다</p>
        ) : commentsCollapsed ? (
          <p className="text-sm text-muted-foreground">
            {pending.length}건의 댓글이 접혀 있습니다
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => handleAction(c.id, "approve")}
                      disabled={processingIds.has(c.id)}
                    >
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 sm:flex-none"
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
                      className="flex-1 text-muted-foreground sm:flex-none"
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
                  <p className="text-sm whitespace-pre-wrap break-words">
                    &ldquo;{c.comment_text}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 승인된 댓글 (취소 가능) */}
        {approvedComments.length > 0 && (
          <div className="mt-4 border-t pt-4 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              게시 대기 ({approvedComments.length}건)
            </p>
            {approvedComments.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    <span className="font-medium">[{c.blog_id}]</span>{" "}
                    <span className="text-muted-foreground">{c.comment_text.slice(0, 40)}...</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  onClick={async () => {
                    const ok = await apiApprovePendingComment(c.id, "revoke");
                    if (ok) onRevoked(c.id);
                  }}
                >
                  승인 취소
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
