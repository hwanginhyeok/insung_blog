"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ── 상수 ──

const CATEGORIES = [
  { key: "voice", label: "말투", desc: "어미, 특유의 표현" },
  { key: "emoji", label: "이모지", desc: "사용 이모지, 빈도, 위치" },
  { key: "structure", label: "글 구조", desc: "오프닝, 사진 배치, 섹션 구분" },
  { key: "ending", label: "마무리", desc: "마무리 패턴, CTA" },
  { key: "forbidden", label: "금지", desc: "절대 쓰지 않는 표현" },
  { key: "custom", label: "기타", desc: "자기지칭, 독자호칭 등" },
  { key: "formatting", label: "포맷팅", desc: "폰트, 사이즈, 정렬, 볼드" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

// ── 타입 ──

interface Persona {
  id: string;
  display_name: string;
  source_blog_url: string | null;
  crawl_status: string;
  crawl_post_count: number;
  crawl_error: string | null;
  crawled_at: string | null;
}

interface PersonaItem {
  id: string;
  category: string;
  key: string;
  value: string;
  priority: number;
  is_active: boolean;
  source: string;
}

interface PendingRule {
  id: string;
  feedback_text: string;
  derived_rule: string;
  created_at: string;
}

interface RecentFeedback {
  id: string;
  feedback_text: string;
  rule_status: "pending" | "approved" | "rejected";
  created_at: string;
}

// ── 상태 라벨 ──

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  none: { text: "미분석", color: "text-muted-foreground" },
  crawling: { text: "크롤링 중...", color: "text-blue-500" },
  analyzing: { text: "AI 분석 중...", color: "text-purple-500" },
  done: { text: "분석 완료", color: "text-green-500" },
  error: { text: "오류", color: "text-red-500" },
};

// ── 메인 페이지 ──

export default function PersonaPage() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [items, setItems] = useState<PersonaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [blogUrl, setBlogUrl] = useState("");
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<CategoryKey | null>(null);
  const [addingTo, setAddingTo] = useState<CategoryKey | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [pendingRules, setPendingRules] = useState<PendingRule[]>([]);
  const [recentFeedbacks, setRecentFeedbacks] = useState<RecentFeedback[]>([]);
  const [processingRule, setProcessingRule] = useState<string | null>(null);

  // ── 데이터 로드 ──

  const loadPersona = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: p } = await supabase
      .from("user_personas")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (p) {
      setPersona(p as Persona);
      setBlogUrl(p.source_blog_url || "");

      const { data: personaItems } = await supabase
        .from("persona_items")
        .select("*")
        .eq("persona_id", p.id)
        .order("priority", { ascending: false });

      if (personaItems) setItems(personaItems as PersonaItem[]);

      // 피드백 데이터 로드
      loadFeedbacks();
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadPersona();
  }, [loadPersona]);

  // ── 피드백 데이터 로드 ──

  async function loadFeedbacks() {
    try {
      const res = await fetch("/api/persona/feedback");
      if (!res.ok) return;
      const data = await res.json();
      setPendingRules(data.pendingRules || []);
      setRecentFeedbacks(data.recentFeedbacks || []);
    } catch {
      // 피드백 로드 실패는 무시
    }
  }

  // ── 규칙 승인/거절 ──

  async function handleRuleAction(
    feedbackId: string,
    action: "approve" | "reject"
  ) {
    setProcessingRule(feedbackId);
    try {
      const res = await fetch("/api/persona/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, action }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("규칙 처리 실패:", err.error);
        return;
      }

      // 승인된 경우 persona 데이터 새로고침 (새 항목 반영)
      if (action === "approve") {
        await loadPersona();
      }

      // 피드백 목록 새로고침
      await loadFeedbacks();
    } catch (e) {
      console.error("규칙 처리 오류:", e);
    } finally {
      setProcessingRule(null);
    }
  }

  // ── 크롤링 + 분석 시작 ──

  async function handleAnalyze() {
    if (!blogUrl.trim()) return;
    setIsCrawling(true);
    setError(null);
    setCrawlMessage("블로그 크롤링 중...");

    try {
      // Step 1: 크롤링
      const crawlRes = await fetch("/api/persona/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogUrl: blogUrl.trim() }),
      });

      if (!crawlRes.ok) {
        const err = await crawlRes.json();
        throw new Error(err.error || "크롤링 실패");
      }

      const crawlData = await crawlRes.json();
      setCrawlMessage(
        `${crawlData.postCount}편 크롤링 완료. AI 분석 중...`
      );

      // Step 2: AI 분석
      const analyzeRes = await fetch("/api/persona/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: crawlData.personaId,
          posts: crawlData.posts,
          fontSummary: crawlData.fontSummary,
        }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "AI 분석 실패");
      }

      const analyzeData = await analyzeRes.json();
      setCrawlMessage(
        `분석 완료! ${analyzeData.itemCount}개 스타일 패턴 발견`
      );

      // 데이터 새로고침
      await loadPersona();
    } catch (e) {
      const message = e instanceof Error ? e.message : "분석 실패";
      setError(message);
      setCrawlMessage("");
    } finally {
      setIsCrawling(false);
    }
  }

  // ── 항목 토글 ──

  async function toggleItem(itemId: string, currentActive: boolean) {
    const supabase = createClient();
    await supabase
      .from("persona_items")
      .update({ is_active: !currentActive })
      .eq("id", itemId);

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, is_active: !currentActive } : item
      )
    );
  }

  // ── 항목 삭제 ──

  async function deleteItem(itemId: string) {
    const supabase = createClient();
    await supabase.from("persona_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  // ── 항목 추가 ──

  async function addItem(category: CategoryKey) {
    if (!newKey.trim() || !newValue.trim() || !persona) return;

    const supabase = createClient();
    const { data } = await supabase
      .from("persona_items")
      .insert({
        persona_id: persona.id,
        category,
        key: newKey.trim(),
        value: newValue.trim(),
        priority: 5,
        source: "user",
      })
      .select()
      .single();

    if (data) {
      setItems((prev) => [data as PersonaItem, ...prev]);
    }

    setNewKey("");
    setNewValue("");
    setAddingTo(null);
  }

  // ── 로딩 ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  // ── 카테고리별 항목 그룹핑 ──

  const grouped: Record<string, PersonaItem[]> = {};
  for (const cat of CATEGORIES) {
    grouped[cat.key] = items.filter((i) => i.category === cat.key);
  }

  // ── 렌더 ──

  const status = persona
    ? STATUS_LABELS[persona.crawl_status] || STATUS_LABELS.none
    : STATUS_LABELS.none;

  return (
    <div className="space-y-6">
      {/* 상단: 블로그 분석 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>페르소나 설정</CardTitle>
          <CardDescription>
            블로그 URL을 입력하면 AI가 글쓰기 스타일을 분석합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://blog.naver.com/블로그ID"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              disabled={isCrawling}
            />
            <Button
              onClick={handleAnalyze}
              disabled={isCrawling || !blogUrl.trim()}
            >
              {isCrawling ? "분석 중..." : "블로그 분석하기"}
            </Button>
          </div>

          {/* 상태 표시 */}
          {persona && (
            <div className="flex items-center gap-4 text-sm">
              <span className={status.color}>{status.text}</span>
              {persona.crawl_post_count > 0 && (
                <span className="text-muted-foreground">
                  {persona.crawl_post_count}편 분석됨
                </span>
              )}
              {persona.crawled_at && (
                <span className="text-muted-foreground">
                  {new Date(persona.crawled_at).toLocaleDateString("ko-KR")}
                </span>
              )}
            </div>
          )}

          {/* 진행 메시지 */}
          {crawlMessage && (
            <p className="text-sm text-blue-500">{crawlMessage}</p>
          )}

          {/* 에러 */}
          {(error || persona?.crawl_error) && (
            <p className="text-sm text-red-500">
              {error || persona?.crawl_error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 항목이 없으면 안내 */}
      {items.length === 0 && !isCrawling && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            블로그를 분석하면 AI가 글쓰기 스타일 패턴을 추출합니다.
            <br />
            추출된 패턴은 글 생성 시 자동으로 적용됩니다.
          </CardContent>
        </Card>
      )}

      {/* 카테고리별 아코디언 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {CATEGORIES.map((cat) => {
            const catItems = grouped[cat.key] || [];
            const activeCount = catItems.filter((i) => i.is_active).length;
            const isOpen = openCategory === cat.key;

            return (
              <Card key={cat.key}>
                {/* 아코디언 헤더 */}
                <button
                  onClick={() =>
                    setOpenCategory(isOpen ? null : cat.key)
                  }
                  className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-secondary/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-medium">
                      {cat.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {cat.desc}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {activeCount}/{catItems.length}
                    </span>
                    <span
                      className={`text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▼
                    </span>
                  </div>
                </button>

                {/* 아코디언 바디 */}
                {isOpen && (
                  <CardContent className="pt-0 pb-4 space-y-2">
                    {catItems.length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">
                        항목 없음
                      </p>
                    )}

                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                          item.is_active
                            ? "bg-background"
                            : "bg-muted/50 opacity-60"
                        }`}
                      >
                        {/* 토글 체크박스 */}
                        <input
                          type="checkbox"
                          checked={item.is_active}
                          onChange={() =>
                            toggleItem(item.id, item.is_active)
                          }
                          className="mt-1 shrink-0"
                        />

                        {/* 내용 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.key}</span>
                            {item.priority >= 7 && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                필수
                              </span>
                            )}
                            {item.source === "user" && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                직접 추가
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-0.5 break-words">
                            {item.value}
                          </p>
                        </div>

                        {/* 삭제 */}
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="text-muted-foreground hover:text-red-500 shrink-0 text-xs"
                          title="삭제"
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* 항목 추가 폼 */}
                    {addingTo === cat.key ? (
                      <div className="space-y-2 border rounded-md p-3">
                        <Input
                          placeholder="패턴명 (예: 반말 어미)"
                          value={newKey}
                          onChange={(e) => setNewKey(e.target.value)}
                        />
                        <Textarea
                          placeholder="설명 (예: ~했어, ~인듯, ~거든 형태의 반말 어미 사용)"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => addItem(cat.key)}
                            disabled={!newKey.trim() || !newValue.trim()}
                          >
                            추가
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setAddingTo(null);
                              setNewKey("");
                              setNewValue("");
                            }}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingTo(cat.key)}
                        className="text-sm text-muted-foreground hover:text-foreground py-1"
                      >
                        + 직접 추가
                      </button>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 피드백 섹션 */}
      {pendingRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI 추천 규칙</CardTitle>
            <CardDescription>
              재생성 피드백에서 AI가 발견한 패턴입니다. 승인하면 글쓰기에
              자동 적용됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRules.map((rule) => {
              let parsed: { category?: string; key?: string; value?: string } =
                {};
              try {
                parsed = JSON.parse(rule.derived_rule);
              } catch {
                /* 파싱 실패 무시 */
              }

              const catLabel =
                CATEGORIES.find((c) => c.key === parsed.category)?.label ||
                parsed.category ||
                "기타";

              return (
                <div
                  key={rule.id}
                  className="rounded-md border p-4 space-y-2"
                >
                  {/* 도출된 규칙 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                          {catLabel}
                        </span>
                        <span className="font-medium text-sm">
                          {parsed.key || "규칙"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground break-words">
                        {parsed.value || rule.derived_rule}
                      </p>
                    </div>

                    {/* 승인/거절 버튼 */}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRuleAction(rule.id, "approve")}
                        disabled={processingRule === rule.id}
                      >
                        {processingRule === rule.id ? "..." : "적용"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRuleAction(rule.id, "reject")}
                        disabled={processingRule === rule.id}
                        className="text-muted-foreground"
                      >
                        무시
                      </Button>
                    </div>
                  </div>

                  {/* 원본 피드백 (참고용) */}
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    원본: &quot;{rule.feedback_text}&quot;
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 최근 피드백 히스토리 */}
      {recentFeedbacks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>피드백 히스토리</CardTitle>
            <CardDescription>
              글 재생성 시 입력한 피드백 기록입니다. 5건이 쌓이면 AI가
              패턴을 분석합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentFeedbacks.map((fb) => (
                <div
                  key={fb.id}
                  className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0"
                >
                  <span className="flex-1 text-muted-foreground truncate">
                    {fb.feedback_text}
                  </span>
                  <span
                    className={`text-xs shrink-0 ${
                      fb.rule_status === "approved"
                        ? "text-green-600"
                        : fb.rule_status === "rejected"
                          ? "text-muted-foreground"
                          : "text-yellow-600"
                    }`}
                  >
                    {fb.rule_status === "approved"
                      ? "적용됨"
                      : fb.rule_status === "rejected"
                        ? "처리됨"
                        : "대기"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(fb.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
