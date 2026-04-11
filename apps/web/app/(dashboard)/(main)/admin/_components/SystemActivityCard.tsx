"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface ActivityData {
  summary: {
    generation: number;
    comment: number;
    bot: number;
    total: number;
    uniqueActiveUsers30: number;
  };
  daily30: {
    date: string;
    generation: number;
    comment: number;
    bot: number;
    total: number;
    activeUsers: number;
  }[];
}

function shortDate(d: string) {
  return `${d.slice(5, 7)}/${d.slice(8, 10)}`;
}

export function SystemActivityCard() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/stats/activity");
        if (!res.ok) {
          if (!cancelled) setError(`활동 통계 조회 실패 (${res.status})`);
          return;
        }
        const json = (await res.json()) as ActivityData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">시스템 활동 (최근 30일)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">총 활동</p>
                <p className="text-lg font-bold tabular-nums">{data.summary.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">활성 유저</p>
                <p className="text-lg font-bold tabular-nums">{data.summary.uniqueActiveUsers30}명</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">글 생성</p>
                <p className="text-lg font-bold tabular-nums">{data.summary.generation}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">봇 실행</p>
                <p className="text-lg font-bold tabular-nums">{data.summary.bot}</p>
              </div>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.daily30.map((d) => ({ ...d, label: shortDate(d.date) }))}
                  margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="generation"
                    name="글생성"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="comment"
                    name="댓글"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bot"
                    name="봇실행"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="activeUsers"
                    name="활성유저"
                    stroke="#a855f7"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
