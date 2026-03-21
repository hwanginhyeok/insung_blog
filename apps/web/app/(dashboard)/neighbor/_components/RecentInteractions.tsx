"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NeighborInteraction } from "../_lib/neighbor-api";

interface Props {
  interactions: NeighborInteraction[];
}

const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  comment_sent: { label: "댓글 작성", className: "bg-blue-100 text-blue-700" },
  comment_received: { label: "댓글 수신", className: "bg-green-100 text-green-700" },
  visit: { label: "방문", className: "bg-gray-100 text-gray-600" },
};

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

export function RecentInteractions({ interactions }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>최근 교류</CardTitle>
      </CardHeader>
      <CardContent>
        {interactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">교류 기록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {interactions.slice(0, 20).map((i) => {
              const typeInfo = TYPE_LABELS[i.interaction_type] || {
                label: i.interaction_type,
                className: "bg-gray-100 text-gray-600",
              };
              return (
                <div
                  key={i.id}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${typeInfo.className}`}
                    >
                      {typeInfo.label}
                    </span>
                    <span className="font-medium">{i.blog_id}</span>
                    {i.content && (
                      <span className="truncate text-muted-foreground">
                        {i.content.slice(0, 50)}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(i.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
