"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NeighborRequest } from "../_lib/neighbor-api";

interface Props {
  requests: NeighborRequest[];
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  sent: { label: "전송됨", className: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "수락", className: "bg-green-100 text-green-700" },
  rejected: { label: "거절", className: "bg-red-100 text-red-700" },
  cancelled: { label: "취소", className: "bg-gray-100 text-gray-600" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function RequestHistory({ requests }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>신청 이력</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">신청 이력이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const statusInfo = STATUS_LABELS[r.status] || {
                label: r.status,
                className: "bg-gray-100 text-gray-600",
              };
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">
                      {r.target_blog_name || r.target_blog_id}
                    </span>
                    {r.message && (
                      <span className="ml-2 text-muted-foreground truncate">
                        &ldquo;{r.message.slice(0, 30)}&rdquo;
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}
                    >
                      {statusInfo.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.requested_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
