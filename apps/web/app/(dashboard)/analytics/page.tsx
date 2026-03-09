"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── 타입 ──

interface PostStat {
  id: string;
  post_url: string;
  post_title: string | null;
  view_count: number;
  comment_count: number;
  like_count: number;
  crawled_at: string;
}

interface TimelineEntry {
  post_url: string;
  view_count: number;
  crawled_at: string;
}

interface Summary {
  totalViews: number;
  avgViews: number;
  totalPosts: number;
  topPost: PostStat | null;
}

// ── 메인 ──

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PostStat[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [selectedPost, setSelectedPost] = useState<string | null>(null);

  // ── 데이터 로드 ──

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || []);
        setTimeline(data.timeline || []);
        setSummary(data.summary || null);
      }
    } catch {
      // 로드 실패 무시
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // ── 크롤링 트리거 ──

  async function handleCrawl() {
    if (!newUrl.trim()) return;
    setIsCrawling(true);
    setCrawlMessage("조회수를 수집하고 있어요...");

    try {
      const urls = newUrl
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);

      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (res.ok) {
        const data = await res.json();
        setCrawlMessage(data.message);
        setNewUrl("");
        await loadData();
      } else {
        const err = await res.json();
        setCrawlMessage(err.error || "크롤링 실패");
      }
    } catch {
      setCrawlMessage("오류가 발생했습니다");
    } finally {
      setIsCrawling(false);
    }
  }

  // 전체 조회수 업데이트 (기존 URL들 재크롤링)
  async function handleRefreshAll() {
    if (stats.length === 0) return;
    setIsCrawling(true);
    setCrawlMessage("전체 조회수를 업데이트하고 있어요...");

    try {
      const urls = stats.map((s) => s.post_url);
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (res.ok) {
        const data = await res.json();
        setCrawlMessage(data.message);
        await loadData();
      }
    } catch {
      setCrawlMessage("오류가 발생했습니다");
    } finally {
      setIsCrawling(false);
    }
  }

  // ── 차트 데이터 (선택된 게시물 또는 전체) ──

  const chartData = (() => {
    const filtered = selectedPost
      ? timeline.filter((t) => t.post_url === selectedPost)
      : timeline;

    // 날짜별 합산
    const byDate: Record<string, number> = {};
    for (const entry of filtered) {
      const date = entry.crawled_at.split("T")[0];
      byDate[date] = (byDate[date] || 0) + entry.view_count;
    }

    return Object.entries(byDate)
      .map(([date, views]) => ({ date: date.slice(5), views })) // MM-DD
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

  // ── 렌더 ──

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
        <h1 className="text-2xl font-bold">성과 분석</h1>
        <p className="text-sm text-muted-foreground">
          게시물 조회수와 성과를 추적합니다
        </p>
      </div>

      {/* 요약 카드 3개 */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>총 조회수</CardDescription>
              <CardTitle className="text-2xl">
                {summary.totalViews.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>평균 조회수</CardDescription>
              <CardTitle className="text-2xl">
                {summary.avgViews.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>인기글</CardDescription>
              <CardTitle className="text-base truncate">
                {summary.topPost?.post_title || "—"}
              </CardTitle>
              {summary.topPost && (
                <p className="text-sm text-muted-foreground">
                  {summary.topPost.view_count.toLocaleString()}회
                </p>
              )}
            </CardHeader>
          </Card>
        </div>
      )}

      {/* 추이 차트 */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">조회수 추이</CardTitle>
              {stats.length > 1 && (
                <select
                  value={selectedPost || ""}
                  onChange={(e) =>
                    setSelectedPost(e.target.value || null)
                  }
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                >
                  <option value="">전체</option>
                  {stats.map((s) => (
                    <option key={s.post_url} value={s.post_url}>
                      {s.post_title || s.post_url}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  name="조회수"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* URL 추가 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">게시물 추가</CardTitle>
          <CardDescription>
            네이버 블로그 게시물 URL을 입력하면 조회수를 수집합니다 (줄바꿈으로
            여러 개)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://blog.naver.com/blogId/12345678"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              disabled={isCrawling}
            />
            <Button
              onClick={handleCrawl}
              disabled={isCrawling || !newUrl.trim()}
            >
              {isCrawling ? "수집 중..." : "추가"}
            </Button>
          </div>
          {crawlMessage && (
            <p className="text-sm text-blue-500">{crawlMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* 게시물 목록 */}
      {stats.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                게시물 목록 ({stats.length}개)
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshAll}
                disabled={isCrawling}
              >
                {isCrawling ? "업데이트 중..." : "전체 업데이트"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.map((stat) => (
                <div
                  key={stat.id}
                  className="flex items-center gap-4 rounded-md border px-4 py-3 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {stat.post_title || "제목 없음"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {stat.post_url}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <p className="font-medium">
                        {stat.view_count.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">조회</p>
                    </div>
                    <div>
                      <p className="font-medium">
                        {stat.comment_count.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">댓글</p>
                    </div>
                    <div>
                      <p className="font-medium">
                        {stat.like_count.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">공감</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(stat.crawled_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 데이터 없을 때 */}
      {stats.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            아직 추적 중인 게시물이 없습니다.
            <br />
            위에서 게시물 URL을 추가해보세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
