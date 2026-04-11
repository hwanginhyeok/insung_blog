"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface UsageData {
  summary: {
    lastActivityAt: string | null;
    total30: { generation: number; comment: number; bot: number; incoming: number; total: number };
  };
  heatmap: { day: number; hour: number; count: number }[];
  hourly24: { hour: number; count: number }[];
  daily30: {
    date: string;
    generation: number;
    comment: number;
    bot: number;
    incoming: number;
    total: number;
  }[];
  monthly: {
    thisMonth: { key: string; generation: number; comment: number; bot: number; incoming: number; total: number };
    lastMonth: { key: string; generation: number; comment: number; bot: number; incoming: number; total: number };
  };
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(d: string) {
  // YYYY-MM-DD → MM/DD
  return `${d.slice(5, 7)}/${d.slice(8, 10)}`;
}

function formatPercent(curr: number, prev: number): { label: string; up: boolean } {
  if (prev === 0) {
    if (curr === 0) return { label: "—", up: false };
    return { label: "신규", up: true };
  }
  const diff = ((curr - prev) / prev) * 100;
  const sign = diff >= 0 ? "+" : "";
  return { label: `${sign}${diff.toFixed(0)}%`, up: diff >= 0 };
}

export function UserUsageTab({ userId }: { userId: string }) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/users/${userId}/usage`);
        if (!res.ok) {
          setError(`사용 통계 조회 실패 (${res.status})`);
          return;
        }
        const json = (await res.json()) as UsageData;
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
  }, [userId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">사용 통계 불러오는 중...</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>;
  }

  const { summary, heatmap, hourly24, daily30, monthly } = data;

  // heatmap을 7x24 행렬로 재구성 + 최댓값 (색 농도 계산용)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxCount = 0;
  for (const cell of heatmap) {
    grid[cell.day][cell.hour] = cell.count;
    if (cell.count > maxCount) maxCount = cell.count;
  }

  function cellColor(count: number): string {
    if (count === 0) return "rgb(241, 245, 249)"; // slate-100
    const ratio = maxCount === 0 ? 0 : count / maxCount;
    // emerald-500 (16, 185, 129) 농도
    const alpha = 0.15 + ratio * 0.85;
    return `rgba(16, 185, 129, ${alpha.toFixed(2)})`;
  }

  // 월별 비교
  const tm = monthly.thisMonth;
  const lm = monthly.lastMonth;
  const totalDelta = formatPercent(tm.total, lm.total);
  const genDelta = formatPercent(tm.generation, lm.generation);
  const comDelta = formatPercent(tm.comment, lm.comment);
  const botDelta = formatPercent(tm.bot, lm.bot);

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">30일 총 활동</p>
          <p className="text-lg font-bold tabular-nums">{summary.total30.total}</p>
        </div>
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">글 생성</p>
          <p className="text-lg font-bold tabular-nums">{summary.total30.generation}</p>
        </div>
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">댓글 작성</p>
          <p className="text-lg font-bold tabular-nums">{summary.total30.comment}</p>
        </div>
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">봇 실행</p>
          <p className="text-lg font-bold tabular-nums">{summary.total30.bot}</p>
        </div>
      </div>
      {summary.lastActivityAt && (
        <p className="text-xs text-muted-foreground">
          마지막 활동: {formatDate(summary.lastActivityAt)}
        </p>
      )}

      {/* 시간대 heatmap (요일 x 시간) */}
      <div>
        <h4 className="mb-2 text-sm font-medium">시간대 활동 (KST, 최근 30일)</h4>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="w-8"></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="w-5 text-center font-normal text-muted-foreground">
                    {h % 6 === 0 ? h : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_LABELS.map((label, dayIdx) => (
                <tr key={dayIdx}>
                  <td className="pr-1 text-right text-muted-foreground">{label}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const count = grid[dayIdx][h];
                    return (
                      <td key={h} className="p-0.5">
                        <div
                          className="h-4 w-4 rounded-sm"
                          style={{ backgroundColor: cellColor(count) }}
                          title={`${label}요일 ${h}시 — ${count}건`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          색이 진할수록 활동 많음 (최대 {maxCount}건)
        </p>
      </div>

      {/* 24시간대 막대 */}
      <div>
        <h4 className="mb-2 text-sm font-medium">시간대별 활동 (0~23시)</h4>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly24} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(h) => `${h}시`}
              />
              <Bar dataKey="count" name="활동수" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 30일 line */}
      <div>
        <h4 className="mb-2 text-sm font-medium">최근 30일 추이</h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={daily30.map((d) => ({ ...d, label: formatShortDate(d.date) }))}
              margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="generation" name="글생성" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="comment" name="댓글" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="bot" name="봇실행" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 월별 비교 카드 */}
      <div>
        <h4 className="mb-2 text-sm font-medium">월별 비교</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{tm.key} (이번 달)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{tm.total}</p>
            <p className={`text-xs ${totalDelta.up ? "text-emerald-600" : "text-red-600"}`}>
              지난 달 대비 {totalDelta.label}
            </p>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>글생성</span>
                <span className="tabular-nums">
                  {tm.generation} <span className={genDelta.up ? "text-emerald-600" : "text-red-600"}>({genDelta.label})</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span>댓글</span>
                <span className="tabular-nums">
                  {tm.comment} <span className={comDelta.up ? "text-emerald-600" : "text-red-600"}>({comDelta.label})</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span>봇실행</span>
                <span className="tabular-nums">
                  {tm.bot} <span className={botDelta.up ? "text-emerald-600" : "text-red-600"}>({botDelta.label})</span>
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">{lm.key} (지난 달)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-muted-foreground">{lm.total}</p>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>글생성</span>
                <span className="tabular-nums">{lm.generation}</span>
              </div>
              <div className="flex justify-between">
                <span>댓글</span>
                <span className="tabular-nums">{lm.comment}</span>
              </div>
              <div className="flex justify-between">
                <span>봇실행</span>
                <span className="tabular-nums">{lm.bot}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
