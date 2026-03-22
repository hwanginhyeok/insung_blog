"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DayData {
  date: string;
  comments: number;
  bloggers: number;
  failed: number;
  runs: number;
}

interface CommentCalendarProps {
  days?: number;
}

const INTENSITY = [
  "bg-muted",
  "bg-green-200 dark:bg-green-900",
  "bg-green-400 dark:bg-green-700",
  "bg-green-600 dark:bg-green-500",
  "bg-green-800 dark:bg-green-300",
];

function getIntensity(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  if (count <= 15) return 3;
  return 4;
}

function generateCalendarDays(data: DayData[], totalDays: number) {
  const dataMap = new Map(data.map((d) => [d.date, d]));
  const days: { date: string; data: DayData | null }[] = [];

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    days.push({ date: key, data: dataMap.get(key) || null });
  }
  return days;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function CommentCalendar({ days = 28 }: CommentCalendarProps) {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; data: DayData | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/bot/stats?period=daily&days=${days}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setData(json.data || []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  const calendarDays = generateCalendarDays(data, days);

  // 주차별로 그룹 (7일 단위)
  const weeks: typeof calendarDays[] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  // 합계
  const totals = data.reduce(
    (acc, d) => ({
      comments: acc.comments + d.comments,
      bloggers: acc.bloggers + d.bloggers,
      runs: acc.runs + d.runs,
    }),
    { comments: 0, bloggers: 0, runs: 0 }
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">활동 캘린더</CardTitle>
        <CardDescription>
          최근 {days}일 · 댓글 {totals.comments}개 · 방문 {totals.bloggers}명 · 실행 {totals.runs}회
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : (
          <div className="space-y-2">
            {/* 캘린더 그리드 */}
            <div className="flex gap-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day) => {
                    const count = day.data?.comments || 0;
                    const intensity = getIntensity(count);
                    return (
                      <div
                        key={day.date}
                        className={`h-4 w-4 rounded-sm cursor-pointer transition-colors ${INTENSITY[intensity]}`}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        title={`${day.date}: ${count}개`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* 호버 정보 */}
            {hoveredDay && (
              <div className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">{formatDate(hoveredDay.date)}</span>
                {" · "}
                {hoveredDay.data ? (
                  <>
                    댓글 {hoveredDay.data.comments}개 · 방문 {hoveredDay.data.bloggers}명
                    {hoveredDay.data.failed > 0 && ` · 실패 ${hoveredDay.data.failed}개`}
                  </>
                ) : (
                  "활동 없음"
                )}
              </div>
            )}

            {/* 범례 */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <span>적음</span>
              {INTENSITY.map((cls, i) => (
                <div key={i} className={`h-3 w-3 rounded-sm ${cls}`} />
              ))}
              <span>많음</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
