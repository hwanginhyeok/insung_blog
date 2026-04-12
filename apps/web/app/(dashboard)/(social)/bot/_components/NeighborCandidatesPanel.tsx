"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X, Sparkles, RefreshCw, Users, Zap } from "lucide-react";

interface PendingCandidate {
  id: string;
  blog_id: string;
  blog_name: string;
  main_topics: string[];
  post_count_30d: number;
  quality_flag: string;
  relevance: "relevant" | "uncertain" | "off_topic" | null;
  relevance_score: number;
  source_keywords: string[];
  reasoning: string;
  generated_at: string;
}

interface CandidatesResponse {
  pending: PendingCandidate[];
  counts: { pending: number; approved: number; rejected: number };
  profile: {
    categories: string[];
    keywords: string[];
    analyzed_at: string | null;
  } | null;
}

interface CommandResponse {
  success?: boolean;
  command?: { id: string; command: string; status: string };
  error?: string;
}

interface AutoDiscoverData {
  autoDiscoverMode: boolean;
  eligible: boolean;
  stats: { totalDecided: number; approved: number; rejected: number; approvalRate: number };
  requirements: { minDecided: number; minApprovalRate: number };
}

const RELEVANCE_LABEL: Record<string, string> = {
  relevant: "분야 적합",
  uncertain: "애매",
  off_topic: "비적합",
};

const RELEVANCE_STYLE: Record<string, string> = {
  relevant: "bg-emerald-100 text-emerald-700",
  uncertain: "bg-amber-100 text-amber-700",
  off_topic: "bg-gray-100 text-gray-600",
};

function shortDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  } catch {
    return d.slice(5, 10);
  }
}

export function NeighborCandidatesPanel() {
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [autoData, setAutoData] = useState<AutoDiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candRes, autoRes] = await Promise.all([
        fetch("/api/bot/candidates"),
        fetch("/api/bot/auto-discover"),
      ]);
      if (!candRes.ok) {
        setError(`후보 조회 실패 (${candRes.status})`);
        return;
      }
      const json = (await candRes.json()) as CandidatesResponse;
      setData(json);
      setSelected(new Set());

      if (autoRes.ok) {
        setAutoData((await autoRes.json()) as AutoDiscoverData);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 토글
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!data) return;
    setSelected(new Set(data.pending.map((c) => c.id)));
  };

  const clearSelect = () => setSelected(new Set());

  // 일괄 결정
  const decide = async (decision: "approved" | "rejected", ids?: string[]) => {
    const targetIds = ids ?? Array.from(selected);
    if (targetIds.length === 0) return;
    setActionLoading(decision);

    try {
      const res = await fetch("/api/bot/candidates/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_ids: targetIds, decision }),
      });
      const json = await res.json();

      if (!res.ok) {
        flashToast(json.error || `결정 실패 (${res.status})`);
        return;
      }

      const verb = decision === "approved" ? "승인" : "거부";
      flashToast(
        decision === "approved"
          ? `${json.candidates_updated}명 ${verb} → 이웃 ${json.neighbors_added}명 추가`
          : `${json.candidates_updated}명 ${verb}`
      );
      await load();
    } catch {
      flashToast("결정 중 네트워크 오류");
    } finally {
      setActionLoading(null);
    }
  };

  // 지금 발견 실행
  const triggerDiscover = async () => {
    setDiscovering(true);
    try {
      const res = await fetch("/api/bot/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "discover_for_review" }),
      });
      const json = (await res.json()) as CommandResponse;
      if (!res.ok) {
        flashToast(json.error || "발견 명령 등록 실패");
      } else {
        flashToast("이웃 발견 시작 — 1~3분 후 새로고침해주세요");
      }
    } catch {
      flashToast("발견 명령 네트워크 오류");
    } finally {
      setDiscovering(false);
    }
  };

  // 자동 모드 토글
  const toggleAutoMode = async () => {
    if (!autoData) return;
    setToggleLoading(true);
    try {
      const res = await fetch("/api/bot/auto-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !autoData.autoDiscoverMode }),
      });
      const json = await res.json();
      if (!res.ok) {
        flashToast(json.error || "토글 변경 실패");
      } else {
        setAutoData({ ...autoData, autoDiscoverMode: json.autoDiscoverMode });
        flashToast(
          json.autoDiscoverMode
            ? "자동 모드 ON — 야간 발견 시 즉시 추가됩니다"
            : "자동 모드 OFF — 검토 후 수동 승인"
        );
      }
    } catch {
      flashToast("자동 모드 변경 네트워크 오류");
    } finally {
      setToggleLoading(false);
    }
  };

  // 분야 재분석
  const triggerAnalyzeProfile = async () => {
    setAnalyzingProfile(true);
    try {
      const res = await fetch("/api/bot/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "analyze_blog_profile",
          payload: { force: true },
        }),
      });
      const json = (await res.json()) as CommandResponse;
      if (!res.ok) {
        flashToast(json.error || "분야 재분석 등록 실패");
      } else {
        flashToast("분야 재분석 시작 — 30초 후 새로고침");
      }
    } catch {
      flashToast("분야 재분석 네트워크 오류");
    } finally {
      setAnalyzingProfile(false);
    }
  };

  const pendingCount = data?.counts.pending ?? 0;
  const profileCategories = data?.profile?.categories ?? [];

  // 정렬: relevance_score 내림차순
  const sortedPending = useMemo(() => {
    if (!data) return [];
    return [...data.pending].sort((a, b) => b.relevance_score - a.relevance_score);
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">
              이웃 발견 — 검토 대기
              {pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </CardTitle>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={triggerAnalyzeProfile}
              disabled={analyzingProfile}
              title="내 블로그를 다시 분석해서 분야/검색 키워드를 갱신합니다"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${analyzingProfile ? "animate-spin" : ""}`} />
              분야 재분석
            </Button>
            <Button
              size="sm"
              onClick={triggerDiscover}
              disabled={discovering}
              title="새 이웃 후보를 지금 발견합니다 (검토 대기 큐에 추가)"
            >
              <Sparkles className={`h-3.5 w-3.5 mr-1 ${discovering ? "animate-pulse" : ""}`} />
              지금 발견
            </Button>
          </div>
        </div>

        {/* 분야 표시 */}
        {profileCategories.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-muted-foreground">내 분야:</span>
            {profileCategories.map((c) => (
              <span key={c} className="rounded-full bg-secondary px-2 py-0.5">
                {c}
              </span>
            ))}
          </div>
        )}

        {/* 자동 모드 (자격 충족 또는 이미 ON일 때만 노출) */}
        {autoData && (autoData.eligible || autoData.autoDiscoverMode) && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Zap className={`h-3.5 w-3.5 ${autoData.autoDiscoverMode ? "text-amber-600" : "text-muted-foreground"}`} />
              <span className="font-medium">자동 추가 모드</span>
              <span className="text-muted-foreground">
                · 누적 {autoData.stats.totalDecided}건 · 승인률 {Math.round(autoData.stats.approvalRate * 100)}%
              </span>
            </div>
            <button
              type="button"
              onClick={toggleAutoMode}
              disabled={toggleLoading}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoData.autoDiscoverMode ? "bg-amber-500" : "bg-gray-300"
              }`}
              aria-label="자동 모드 토글"
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  autoData.autoDiscoverMode ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        )}

        {/* 자격 미달이면 진행 표시만 (작게) */}
        {autoData && !autoData.eligible && !autoData.autoDiscoverMode && autoData.stats.totalDecided > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            자동 모드까지: 누적 {autoData.stats.totalDecided}/{autoData.requirements.minDecided}건 ·
            승인률 {Math.round(autoData.stats.approvalRate * 100)}/{Math.round(autoData.requirements.minApprovalRate * 100)}%
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && data && pendingCount === 0 && (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <p className="text-sm text-muted-foreground">검토할 후보가 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">
              매일 야간 자동으로 후보가 생성되며, &quot;지금 발견&quot;으로 즉시 실행할 수도 있습니다.
            </p>
          </div>
        )}

        {!loading && pendingCount > 0 && (
          <>
            {/* 일괄 액션 */}
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={selected.size === pendingCount ? clearSelect : selectAll}
                >
                  {selected.size === pendingCount ? "전체 해제" : "전체 선택"}
                </button>
                <span>·</span>
                <span>{selected.size}/{pendingCount} 선택</span>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide("rejected")}
                  disabled={selected.size === 0 || actionLoading !== null}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  선택 거부
                </Button>
                <Button
                  size="sm"
                  onClick={() => decide("approved")}
                  disabled={selected.size === 0 || actionLoading !== null}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  선택 승인
                </Button>
              </div>
            </div>

            {/* 카드 그리드 */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {sortedPending.map((c) => {
                const isSelected = selected.has(c.id);
                const relStyle = c.relevance ? RELEVANCE_STYLE[c.relevance] : "bg-gray-100";
                const relLabel = c.relevance ? RELEVANCE_LABEL[c.relevance] : "—";

                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 text-sm transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://blog.naver.com/${c.blog_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium truncate hover:underline"
                            title={c.blog_id}
                          >
                            {c.blog_name || c.blog_id}
                          </a>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${relStyle}`}>
                            {relLabel}
                          </span>
                          {c.relevance_score > 0 && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {Math.round(c.relevance_score * 100)}%
                            </span>
                          )}
                        </div>

                        {c.main_topics.length > 0 && (
                          <div className="mt-1 flex gap-1 flex-wrap">
                            {c.main_topics.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-secondary px-1.5 py-0.5 text-[10px]"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {c.reasoning && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {c.reasoning}
                          </p>
                        )}

                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          {c.post_count_30d > 0 && <span>최근 30일 {c.post_count_30d}개</span>}
                          {c.source_keywords.length > 0 && (
                            <span className="truncate">키워드: {c.source_keywords.join(", ")}</span>
                          )}
                          <span className="ml-auto">{shortDate(c.generated_at)}</span>
                        </div>
                      </div>

                      {/* 개별 빠른 거부 버튼 */}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => decide("rejected", [c.id])}
                        title="이 블로거 거부"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 토스트 */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg">
            {toast}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
