"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";

interface DayData {
  date: string;
  comments: number;
  bloggers: number;
  failed: number;
  runs: number;
}

interface Totals {
  comments: number;
  bloggers: number;
  failed: number;
  runs: number;
}

type ChartType = "line" | "bar";
type Period = 7 | 14 | 30;

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function CommentAnalyticsChart() {
  const [data, setData] = useState<DayData[]>([]);
  const [totals, setTotals] = useState<Totals>({ comments: 0, bloggers: 0, failed: 0, runs: 0 });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(14);
  const [chartType, setChartType] = useState<ChartType>("bar");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/bot/stats?period=daily&days=${period}`);
        if (!res.ok) throw new Error();
        const json = await res.json();

        // 빈 날짜 채우기
        const dataMap = new Map((json.data || []).map((d: DayData) => [d.date, d]));
        const filled: DayData[] = [];
        for (let i = period - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split("T")[0];
          const existing = dataMap.get(key) as DayData | undefined;
          filled.push(existing || { date: key, comments: 0, bloggers: 0, failed: 0, runs: 0 });
        }
        setData(filled);
        setTotals(json.totals || { comments: 0, bloggers: 0, failed: 0, runs: 0 });
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }));

  // 일 평균
  const avgComments = data.length > 0 ? (totals.comments / data.length).toFixed(1) : "0";
  const avgBloggers = data.length > 0 ? (totals.bloggers / data.length).toFixed(1) : "0";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">댓글 분석</CardTitle>
            <CardDescription>
              총 {totals.comments}개 작성 · 일 평균 {avgComments}개 · 방문 평균 {avgBloggers}명
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {([7, 14, 30] as Period[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "ghost"}
                onClick={() => setPeriod(p)}
                className="text-xs h-7 px-2"
              >
                {p}일
              </Button>
            ))}
            <div className="w-px bg-border mx-1" />
            <Button
              size="sm"
              variant={chartType === "bar" ? "default" : "ghost"}
              onClick={() => setChartType("bar")}
              className="text-xs h-7 px-2"
            >
              막대
            </Button>
            <Button
              size="sm"
              variant={chartType === "line" ? "default" : "ghost"}
              onClick={() => setChartType("line")}
              className="text-xs h-7 px-2"
            >
              선
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            데이터 없음
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            {chartType === "line" ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      comments: "댓글",
                      bloggers: "방문",
                      failed: "실패",
                    };
                    return [String(value), labels[String(name)] || String(name)];
                  }}
                />
                <Legend
                  formatter={(value) => {
                    const labels: Record<string, string> = {
                      comments: "댓글",
                      bloggers: "방문",
                      failed: "실패",
                    };
                    return labels[String(value)] || String(value);
                  }}
                />
                <Line type="monotone" dataKey="comments" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="bloggers" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
                {totals.failed > 0 && (
                  <Line type="monotone" dataKey="failed" stroke="hsl(0, 84%, 60%)" strokeWidth={1} dot={false} strokeDasharray="4 4" />
                )}
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      comments: "댓글",
                      bloggers: "방문",
                      failed: "실패",
                    };
                    return [String(value), labels[String(name)] || String(name)];
                  }}
                />
                <Legend
                  formatter={(value) => {
                    const labels: Record<string, string> = {
                      comments: "댓글",
                      bloggers: "방문",
                      failed: "실패",
                    };
                    return labels[String(value)] || String(value);
                  }}
                />
                <Bar dataKey="comments" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="bloggers" fill="hsl(217, 91%, 60%)" radius={[2, 2, 0, 0]} />
                {totals.failed > 0 && (
                  <Bar dataKey="failed" fill="hsl(0, 84%, 60%)" radius={[2, 2, 0, 0]} />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
