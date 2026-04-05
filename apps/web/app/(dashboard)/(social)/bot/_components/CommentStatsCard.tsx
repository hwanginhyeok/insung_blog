"use client";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { RunLog, TodayStats, timeAgo, formatDateTime } from "../_lib/bot-api";

interface CommentStatsCardProps {
  lastRun: RunLog | undefined;
  todayStats: TodayStats;
  pendingCount: number;
  approvedCount: number;
}

export function CommentStatsCard({
  lastRun,
  todayStats,
  pendingCount,
  approvedCount,
}: CommentStatsCardProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* 마지막 실행 */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>마지막 실행</CardDescription>
        </CardHeader>
        <CardContent>
          {lastRun ? (
            <>
              <p className="text-2xl font-bold tracking-tight">{timeAgo(lastRun.run_at)}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(lastRun.run_at)}
                {lastRun.error_message && " (오류)"}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">실행 이력 없음</p>
          )}
        </CardContent>
      </Card>

      {/* 오늘 현황 */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>오늘 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tracking-tight">
            {todayStats.bloggers}명 / {todayStats.comments}개
          </p>
          <p className="text-sm text-muted-foreground">
            방문 {todayStats.bloggers}명 · 댓글 {todayStats.comments}개
            {todayStats.failed > 0 && ` · 실패 ${todayStats.failed}개`}
          </p>
        </CardContent>
      </Card>

      {/* 대기 현황 */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>대기 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tracking-tight">
            {pendingCount}건 / {approvedCount}건
          </p>
          <p className="text-sm text-muted-foreground">
            승인 대기 {pendingCount}건 · 게시 대기 {approvedCount}건
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
