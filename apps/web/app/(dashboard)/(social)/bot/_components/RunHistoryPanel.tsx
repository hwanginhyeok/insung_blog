"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { RunLog, formatDateTime, formatElapsed } from "../_lib/bot-api";

interface RunHistoryPanelProps {
  runs: RunLog[];
  avgDuration: number | null;
}

export function RunHistoryPanel({ runs, avgDuration }: RunHistoryPanelProps) {
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setRunHistoryOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>최근 실행 이력</CardTitle>
            {!runHistoryOpen && runs.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                최근 {runs.length}건
                {avgDuration ? ` · 평균 ${formatElapsed(avgDuration)}` : ""}
              </p>
            )}
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              runHistoryOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </CardHeader>
      {runHistoryOpen && (
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">실행 이력이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(r.run_at)}
                  </span>
                  <span className="whitespace-nowrap">
                    {r.bloggers_visited}명 / {r.comments_written}댓글
                    {r.comments_failed > 0 && (
                      <span className="text-destructive"> / {r.comments_failed}실패</span>
                    )}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap ml-auto">
                    {r.duration_seconds != null
                      ? formatElapsed(r.duration_seconds)
                      : "-"}
                  </span>
                  {r.error_message && (
                    <span className="text-destructive whitespace-nowrap" title={r.error_message}>
                      오류
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
