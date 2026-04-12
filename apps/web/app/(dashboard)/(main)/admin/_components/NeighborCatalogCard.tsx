"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Search, Edit3 } from "lucide-react";

interface CatalogRow {
  blog_id: string;
  blog_name: string | null;
  quality_flag: string;
  ad_score: number | null;
  ai_score: number | null;
  main_topics: string[] | null;
  post_count_30d: number | null;
  reasoning: string | null;
  analyzed_at: string;
  analyzer: string;
  permanently_blocked: boolean;
  manually_corrected: boolean;
  corrected_at: string | null;
}

interface CatalogResponse {
  rows: CatalogRow[];
  counts: { total: number; byFlag: Record<string, number> };
  topTopics: { topic: string; count: number }[];
}

const FLAG_LABELS: Record<string, string> = {
  ok: "정상",
  ad: "광고",
  ai: "AI생성",
  commercial: "상업/기업",
  review_farm: "체험단",
  inactive: "휴면",
  low_quality: "저품질",
};

const FLAG_STYLES: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  ad: "bg-red-100 text-red-700",
  ai: "bg-purple-100 text-purple-700",
  commercial: "bg-orange-100 text-orange-700",
  review_farm: "bg-blue-100 text-blue-700",
  inactive: "bg-gray-100 text-gray-600",
  low_quality: "bg-rose-100 text-rose-700",
};

const FLAG_ORDER = ["ok", "ad", "ai", "commercial", "review_farm", "inactive", "low_quality"] as const;

function shortDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return d.slice(0, 10);
  }
}

export function NeighborCatalogCard() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagFilter, setFlagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (flagFilter) params.set("flag", flagFilter);
      if (search) params.set("q", search);
      params.set("limit", "100");

      const res = await fetch(`/api/admin/neighbor-catalog?${params.toString()}`);
      if (!res.ok) {
        setError(`카탈로그 조회 실패 (${res.status})`);
        return;
      }
      setData((await res.json()) as CatalogResponse);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [flagFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const correctFlag = async (blogId: string, newFlag: string) => {
    try {
      const res = await fetch("/api/admin/neighbor-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blog_id: blogId, quality_flag: newFlag }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "수정 실패");
        return;
      }
      setEditing(null);
      await load();
    } catch {
      alert("수정 네트워크 오류");
    }
  };

  const totalCounts = data?.counts.total ?? 0;
  const byFlag = data?.counts.byFlag ?? {};

  const blockedCount = useMemo(() => {
    return (byFlag.ad || 0) + (byFlag.ai || 0) + (byFlag.commercial || 0) + (byFlag.low_quality || 0);
  }, [byFlag]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">이웃 카탈로그</CardTitle>
            <span className="text-xs text-muted-foreground">
              · 총 {totalCounts}개 · 영구차단 {blockedCount}개
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* flag 분포 칩 (필터로 동작) */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFlagFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              flagFilter === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            }`}
          >
            전체 {totalCounts}
          </button>
          {FLAG_ORDER.map((f) => (
            <button
              key={f}
              onClick={() => setFlagFilter(flagFilter === f ? null : f)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                flagFilter === f
                  ? "ring-2 ring-primary " + FLAG_STYLES[f]
                  : FLAG_STYLES[f] + " opacity-70 hover:opacity-100"
              }`}
            >
              {FLAG_LABELS[f]} {byFlag[f] || 0}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="blog_id 또는 블로그명 검색..."
              className="w-full rounded border bg-background pl-7 pr-2 py-1.5 text-sm"
            />
          </div>
          <Button size="sm" type="submit" variant="outline">
            검색
          </Button>
          {search && (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setSearchInput("");
              }}
            >
              초기화
            </Button>
          )}
        </form>

        {/* 분야 분포 (top 10) */}
        {data && data.topTopics.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-2">
            <p className="text-xs text-muted-foreground mb-1">분야 분포 (top 10)</p>
            <div className="flex flex-wrap gap-1">
              {data.topTopics.slice(0, 10).map(({ topic, count }) => (
                <span key={topic} className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                  {topic} <span className="text-muted-foreground tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && data.rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            조건에 맞는 블로그가 없습니다.
          </p>
        )}

        {/* 행 목록 */}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">블로그</th>
                  <th className="px-2 py-1.5 font-medium">분류</th>
                  <th className="px-2 py-1.5 font-medium">주제</th>
                  <th className="px-2 py-1.5 font-medium">근거</th>
                  <th className="px-2 py-1.5 font-medium">분석</th>
                  <th className="px-2 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const flag = row.quality_flag;
                  const styleClass = FLAG_STYLES[flag] || "bg-gray-100";
                  return (
                    <tr key={row.blog_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <a
                            href={`https://blog.naver.com/${row.blog_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium hover:underline"
                          >
                            {row.blog_name || row.blog_id}
                          </a>
                          {row.manually_corrected && (
                            <span className="text-[9px] text-amber-600" title="관리자 수정됨">●</span>
                          )}
                          {row.permanently_blocked && (
                            <span className="text-[9px] text-red-600" title="영구 차단">⊘</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{row.blog_id}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        {editing === row.blog_id ? (
                          <select
                            autoFocus
                            value={flag}
                            onChange={(e) => correctFlag(row.blog_id, e.target.value)}
                            onBlur={() => setEditing(null)}
                            className="rounded border bg-background px-1.5 py-0.5 text-xs"
                          >
                            {FLAG_ORDER.map((f) => (
                              <option key={f} value={f}>
                                {FLAG_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styleClass}`}>
                            {FLAG_LABELS[flag] || flag}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 max-w-[140px]">
                        <div className="flex flex-wrap gap-0.5">
                          {(row.main_topics || []).slice(0, 3).map((t) => (
                            <span key={t} className="rounded bg-secondary px-1 text-[9px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 max-w-[200px] text-muted-foreground line-clamp-2">
                        {row.reasoning || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-muted-foreground tabular-nums">
                        {shortDate(row.analyzed_at)}
                        {(row.post_count_30d ?? 0) > 0 && (
                          <div>30일 {row.post_count_30d}개</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(editing === row.blog_id ? null : row.blog_id)}
                          className="text-muted-foreground hover:text-primary"
                          title="분류 수정"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
