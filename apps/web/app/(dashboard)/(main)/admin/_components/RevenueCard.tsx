"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface RevenueData {
  thisMonth: { key: string; amount: number; count: number; basic: number; pro: number };
  lastMonth: { key: string; amount: number; count: number; basic: number; pro: number };
  monthly12: { month: string; amount: number; count: number; basic: number; pro: number }[];
  total12: { amount: number; count: number };
  bySubscription: Record<string, number>;
  byTier: Record<string, number>;
}

function formatWon(n: number): string {
  if (n >= 10000) {
    return `${(n / 10000).toFixed(1)}만원`;
  }
  return `₩${n.toLocaleString("ko-KR")}`;
}

function formatWonFull(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function shortMonth(m: string): string {
  // YYYY-MM → MM월
  return `${parseInt(m.slice(5, 7), 10)}월`;
}

function deltaPct(curr: number, prev: number): { label: string; up: boolean } {
  if (prev === 0) {
    if (curr === 0) return { label: "—", up: false };
    return { label: "신규", up: true };
  }
  const diff = ((curr - prev) / prev) * 100;
  const sign = diff >= 0 ? "+" : "";
  return { label: `${sign}${diff.toFixed(0)}%`, up: diff >= 0 };
}

export function RevenueCard() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/stats/revenue");
        if (!res.ok) {
          if (!cancelled) setError(`매출 통계 조회 실패 (${res.status})`);
          return;
        }
        const json = (await res.json()) as RevenueData;
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
        <CardTitle className="text-base">매출 트렌드 (최근 12개월)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">이번 달</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">
                  {formatWon(data.thisMonth.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.thisMonth.count}건 (
                  <span className={deltaPct(data.thisMonth.amount, data.lastMonth.amount).up ? "text-emerald-600" : "text-red-600"}>
                    {deltaPct(data.thisMonth.amount, data.lastMonth.amount).label}
                  </span>
                  )
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">지난 달</p>
                <p className="text-lg font-bold tabular-nums">{formatWon(data.lastMonth.amount)}</p>
                <p className="text-xs text-muted-foreground">{data.lastMonth.count}건</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">12개월 누적</p>
                <p className="text-lg font-bold tabular-nums">{formatWon(data.total12.amount)}</p>
                <p className="text-xs text-muted-foreground">{data.total12.count}건</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">활성 구독</p>
                <p className="text-lg font-bold tabular-nums">{data.bySubscription.active || 0}명</p>
                <p className="text-xs text-muted-foreground">
                  B:{data.byTier.basic || 0} P:{data.byTier.pro || 0}
                </p>
              </div>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.monthly12.map((m) => ({ ...m, label: shortMonth(m.month) }))}
                  margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}만` : `${v}`)}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={((value: unknown, name: unknown) => {
                      if (typeof value === "number" && name === "매출") {
                        return [formatWonFull(value), name];
                      }
                      return [String(value ?? ""), String(name ?? "")];
                    }) as never}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="amount" name="매출" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
