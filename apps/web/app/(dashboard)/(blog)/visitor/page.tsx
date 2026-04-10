"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface VisitorStat {
  id: string;
  blog_id: string;
  date: string;
  day_visitor_count: number | null;
  total_visitor_count: number | null;
  subscriber_count: number | null;
}

interface ChartData {
  date: string;
  dayVisitor: number;
  totalVisitor: number;
  subscriber: number;
}

export default function VisitorStatsPage() {
  const [stats, setStats] = useState<VisitorStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/visitor/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats || []);
        }
      } catch {
        // 무시
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  // 차트 데이터 변환
  const chartData: ChartData[] = stats.map((s) => ({
    date: new Date(s.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    dayVisitor: s.day_visitor_count || 0,
    totalVisitor: s.total_visitor_count || 0,
    subscriber: s.subscriber_count || 0,
  }));

  // 최신 데이터 요약
  const latest = stats[stats.length - 1];
  const previous = stats[stats.length - 2];

  // 일일 증감
  const dayChange =
    latest && previous
      ? (latest.day_visitor_count || 0) - (previous.day_visitor_count || 0)
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">방문자수 추이</h1>
        <p className="text-sm text-muted-foreground">
          블로그 일일 방문자수와 누적 방문자수를 추적합니다
        </p>
      </div>

      {/* 요약 카드 */}
      {latest && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>오늘 방문자</CardDescription>
              <CardTitle className="text-2xl">
                {latest.day_visitor_count?.toLocaleString() || "0"}
              </CardTitle>
              {dayChange !== 0 && (
                <p
                  className={`text-xs ${
                    dayChange > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {dayChange > 0 ? "+" : ""}
                  {dayChange.toLocaleString()} 전일 대비
                </p>
              )}
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>누적 방문자</CardDescription>
              <CardTitle className="text-2xl">
                {latest.total_visitor_count?.toLocaleString() || "0"}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>구독자수</CardDescription>
              <CardTitle className="text-2xl">
                {latest.subscriber_count?.toLocaleString() || "0"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* 추이 차트 */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">방문자수 추이 (최근 30일)</CardTitle>
            <CardDescription>일일 방문자수 변화</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="dayVisitor"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  name="일일 방문자"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 데이터 없을 때 */}
      {stats.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            아직 방문자수 데이터가 없습니다.
            <br />
            방문자수 수집 스크립트가 정상 실행되면 데이터가 표시됩니다.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
