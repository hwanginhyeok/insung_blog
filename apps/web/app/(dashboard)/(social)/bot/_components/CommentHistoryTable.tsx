"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PendingComment,
  STATUS_LABELS,
  HISTORY_TABS,
  formatDateTime,
} from "../_lib/bot-api";

interface CommentHistoryTableProps {
  historyTab: string;
  history: PendingComment[];
  historyLoading: boolean;
  onTabChange: (tab: string) => void;
}

export function CommentHistoryTable({
  historyTab,
  history,
  historyLoading,
  onTabChange,
}: CommentHistoryTableProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">댓글 내역</CardTitle>
            <CardDescription>승인/거부/게시된 댓글 처리 이력</CardDescription>
          </div>
          <svg
            className={`h-5 w-5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {HISTORY_TABS.map((tab) => (
              <Button
                key={tab.key}
                size="sm"
                variant={historyTab === tab.key ? "default" : "outline"}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {historyLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">내역이 없습니다</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {history.map((c) => (
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
                    <div className="flex shrink-0 items-center gap-2">
                      {STATUS_LABELS[c.status] && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[c.status].className}`}
                        >
                          {STATUS_LABELS[c.status].label}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(c.created_at)}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    &ldquo;{c.comment_text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
