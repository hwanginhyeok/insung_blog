"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import {
  RunLog,
  TodayStats,
} from "../_lib/bot-api";

interface MonthlyReportProps {
  runs: RunLog[];
  todayStats: TodayStats;
}

/** 현재 월의 문자열 (예: "2026-04") */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 한국어 월 표시 (예: "4월") */
function monthLabel(): string {
  return `${new Date().getMonth() + 1}월`;
}

/**
 * 월간 성과 리포트 — bot 페이지 하단에 표시.
 * runs 배열에서 이번 달 데이터를 집계하여 요약 카드를 보여준다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MonthlyReport({ runs, todayStats }: MonthlyReportProps) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({
    totalComments: 0,
    totalReplies: 0, // pending_count를 답글 근사치로 사용
    totalBloggers: 0,
    totalRuns: 0,
    successRate: 0,
  });

  useEffect(() => {
    const month = currentMonth();
    // 이번 달 실행 이력만 필터
    const monthRuns = runs.filter((r) => r.run_at.startsWith(month));

    const totalRuns = monthRuns.length;
    const totalComments = monthRuns.reduce((s, r) => s + r.comments_written, 0);
    const totalFailed = monthRuns.reduce((s, r) => s + r.comments_failed, 0);
    const totalBloggers = monthRuns.reduce((s, r) => s + r.bloggers_visited, 0);
    const totalPending = monthRuns.reduce((s, r) => s + (r.pending_count || 0), 0);
    const totalAttempts = totalComments + totalFailed;
    const successRate = totalAttempts > 0 ? Math.round((totalComments / totalAttempts) * 100) : 0;

    setStats({
      totalComments,
      totalReplies: totalPending,
      totalBloggers,
      totalRuns,
      successRate,
    });
  }, [runs]);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>이번 달 성과 리포트</CardTitle>
            {!open && (
              <p className="mt-1 text-sm text-muted-foreground">
                {monthLabel()} — 댓글 {stats.totalComments}개 · 블로거 {stats.totalBloggers}명
              </p>
            )}
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* 댓글 */}
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold tracking-tight">{stats.totalComments}</p>
              <p className="text-xs text-muted-foreground">생성/게시 댓글</p>
            </div>
            {/* 방문 블로거 */}
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold tracking-tight">{stats.totalBloggers}</p>
              <p className="text-xs text-muted-foreground">방문 블로거</p>
            </div>
            {/* 봇 실행 횟수 */}
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold tracking-tight">{stats.totalRuns}</p>
              <p className="text-xs text-muted-foreground">봇 실행 횟수</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* 대기/답글 */}
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold tracking-tight">{stats.totalReplies}</p>
              <p className="text-xs text-muted-foreground">총 대기/답글 수</p>
            </div>
            {/* 성공률 */}
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold tracking-tight">
                {stats.totalRuns > 0 ? `${stats.successRate}%` : "-"}
              </p>
              <p className="text-xs text-muted-foreground">댓글 성공률</p>
            </div>
          </div>
          {stats.totalRuns === 0 && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              이번 달 실행 이력이 없습니다
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
