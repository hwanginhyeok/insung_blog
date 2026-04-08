"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { useToast } from "@/components/ui/toast";
import { Modal, ModalHeader, ModalFooter } from "@/components/ui/modal";

// ── 타입 ──

interface Persona {
  id: string;
  display_name: string;
  source_blog_url: string | null;
  crawl_status: string;
  crawl_post_count: number;
  crawl_error: string | null;
  crawled_at: string | null;
  is_default: boolean;
  created_at: string;
}

interface PersonaItem {
  id?: string;
  category: string;
  key: string;
  value: string;
  priority: number;
}

interface ExamplePersona {
  id: string;
  display_name: string;
  category: string;
  description: string;
  style_preview: string;
  sort_order: number;
  items: PersonaItem[];
  itemCount: number;
}

// 통합 페르소나 (내 것 + 예시 공용)
interface UnifiedPersona {
  id: string;
  display_name: string;
  type: "mine" | "example";
  description?: string;
  category?: string;
  items: PersonaItem[];
}

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  none: { text: "미분석", color: "text-muted-foreground" },
  crawling: { text: "크롤링 중...", color: "text-blue-600" },
  analyzing: { text: "AI 분석 중...", color: "text-blue-600" },
  done: { text: "분석 완료", color: "text-primary" },
  error: { text: "오류", color: "text-destructive" },
};

const CATEGORY_LABELS: Record<string, string> = {
  맛집: "🍜",
  카페: "☕",
  여행: "✈️",
  일상: "📝",
  리뷰: "⭐",
};

const ITEM_CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  voice: { label: "말투", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" },
  structure: { label: "구성", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" },
  emoji: { label: "이모지", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200" },
  ending: { label: "마무리", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200" },
  forbidden: { label: "금지", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" },
  custom: { label: "특징", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200" },
  formatting: { label: "포맷팅", color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200" },
};

// ── 메인 페이지 ──

export default function PersonaListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBlogUrl, setNewBlogUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  // 예시 페르소나 관련 상태
  const [examples, setExamples] = useState<ExamplePersona[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 내 페르소나 팝업 상태
  const [myPersonaPopup, setMyPersonaPopup] = useState<string | null>(null);
  const [myPersonaItems, setMyPersonaItems] = useState<PersonaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // 비교 모드
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeft, setCompareLeft] = useState<UnifiedPersona | null>(null);
  const [compareRight, setCompareRight] = useState<UnifiedPersona | null>(null);
  const [copyingItem, setCopyingItem] = useState(false);

  // ── 데이터 로드 ──

  async function loadPersonas() {
    try {
      const res = await fetch("/api/persona/list");
      if (!res.ok) return;
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch {
      // 로드 실패 무시
    } finally {
      setLoading(false);
    }
  }

  async function loadExamples() {
    try {
      const res = await fetch("/api/persona/examples");
      if (!res.ok) return;
      const data = await res.json();
      setExamples(data);
    } catch {
      // 예시 로드 실패 무시
    }
  }

  useEffect(() => {
    loadPersonas();
    loadExamples();
  }, []);

  // ── 새 페르소나 생성 (크롤링 + 분석) ──

  async function handleCreate() {
    if (!newBlogUrl.trim()) return;
    setIsCreating(true);
    setError(null);
    setCreateMessage("블로그 크롤링 중...");

    try {
      const crawlRes = await fetch("/api/persona/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogUrl: newBlogUrl.trim() }),
      });

      if (!crawlRes.ok) {
        const err = await crawlRes.json();
        throw new Error(err.error || "크롤링 실패");
      }

      const crawlData = await crawlRes.json();
      const countMsg = crawlData.postCount < 10
        ? `⚠�� ${crawlData.postCount}편만 수집됨 — 게시물이 적으면 페르소나 정확도가 낮을 수 ���습니다. AI 분석 중...`
        : `${crawlData.postCount}편 크롤링 완료. AI 분석 중...`;
      setCreateMessage(countMsg);

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
      setCreateMessage(
        `분석 완료! ${analyzeData.itemCount}개 스타일 패턴 발견`
      );

      setShowNewForm(false);
      setNewBlogUrl("");
      setCreateMessage("");
      await loadPersonas();
    } catch (e) {
      const message = e instanceof Error ? e.message : "분석 실패";
      setError(message);
      setCreateMessage("");
    } finally {
      setIsCreating(false);
    }
  }

  // ── 기본 페르소나 설정 ──

  async function handleSetDefault(personaId: string) {
    setSettingDefault(personaId);
    try {
      const res = await fetch("/api/persona/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId }),
      });

      if (res.ok) {
        setPersonas((prev) =>
          prev.map((p) => ({
            ...p,
            is_default: p.id === personaId,
          }))
        );
      }
    } catch {
      // 실패 무시
    } finally {
      setSettingDefault(null);
    }
  }

  // ── 예시 페르소나 복사 ──

  async function handleCopyExample(exampleId: string) {
    setCopyingId(exampleId);
    try {
      const res = await fetch("/api/persona/examples/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exampleId }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast(err.error || "복사 실패", "error");
        return;
      }

      const data = await res.json();
      toast(data.message, "success");
      await loadPersonas();
    } catch {
      toast("복사 중 오류가 발생했습니다", "error");
    } finally {
      setCopyingId(null);
    }
  }

  // ── 내 페르소나 항목 로드 ──

  async function loadMyPersonaItems(personaId: string) {
    setLoadingItems(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("persona_items")
        .select("id, category, key, value, priority")
        .eq("persona_id", personaId)
        .neq("category", "category_prompt")
        .order("priority", { ascending: false });
      setMyPersonaItems((data as PersonaItem[]) || []);
    } catch {
      setMyPersonaItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  function openMyPersonaPopup(personaId: string) {
    setMyPersonaPopup(personaId);
    loadMyPersonaItems(personaId);
  }

  // ── 비교 모드 ──

  function toUnified(persona: Persona, items: PersonaItem[]): UnifiedPersona {
    return { id: persona.id, display_name: persona.display_name || "이름 없음", type: "mine", items };
  }

  function exampleToUnified(ex: ExamplePersona): UnifiedPersona {
    return { id: ex.id, display_name: ex.display_name, type: "example", category: ex.category, items: ex.items };
  }

  async function selectForCompare(unified: UnifiedPersona) {
    if (!compareLeft) {
      setCompareLeft(unified);
    } else if (!compareRight && unified.id !== compareLeft.id) {
      setCompareRight(unified);
    }
  }

  async function copyItemToPersona(item: PersonaItem, targetPersonaId: string) {
    setCopyingItem(true);
    try {
      const supabase = createClient();
      await supabase.from("persona_items").insert({
        persona_id: targetPersonaId,
        category: item.category,
        key: item.key,
        value: item.value,
        priority: item.priority,
        source: "copied",
      });
      toast("항목이 복사되었습니다", "success");
      // 비교 왼쪽이 대상이면 새로고침
      if (compareLeft?.id === targetPersonaId && compareLeft.type === "mine") {
        const supabase2 = createClient();
        const { data } = await supabase2
          .from("persona_items")
          .select("id, category, key, value, priority")
          .eq("persona_id", targetPersonaId)
          .neq("category", "category_prompt")
          .order("priority", { ascending: false });
        setCompareLeft({ ...compareLeft, items: (data as PersonaItem[]) || [] });
      }
      if (compareRight?.id === targetPersonaId && compareRight.type === "mine") {
        const supabase2 = createClient();
        const { data } = await supabase2
          .from("persona_items")
          .select("id, category, key, value, priority")
          .eq("persona_id", targetPersonaId)
          .neq("category", "category_prompt")
          .order("priority", { ascending: false });
        setCompareRight({ ...compareRight, items: (data as PersonaItem[]) || [] });
      }
    } catch {
      toast("복사 실패", "error");
    } finally {
      setCopyingItem(false);
    }
  }

  // 카테고리 필터링
  const categories = [...new Set(examples.map((e) => e.category))];
  const filteredExamples = selectedCategory
    ? examples.filter((e) => e.category === selectedCategory)
    : examples;

  // ── 로딩 ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  // ── 렌더 ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">페르소나 관리</h1>
          <p className="text-sm text-muted-foreground">
            여러 블로그 스타일을 등록하고 글쓰기 시 선택할 수 있습니다
          </p>
        </div>
        <div className="flex gap-2">
          {personas.length > 0 && (
            <Button
              variant={compareMode ? "default" : "outline"}
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareLeft(null);
                setCompareRight(null);
              }}
            >
              {compareMode ? "비교 취소" : "비교하기"}
            </Button>
          )}
          <Button
            onClick={() => setShowNewForm(!showNewForm)}
            disabled={isCreating}
          >
            {showNewForm ? "취소" : "새 페르소나 추가"}
          </Button>
        </div>
      </div>

      {/* 비교 모드 안내 */}
      {compareMode && (
        <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-center">
          {!compareLeft
            ? "비교할 첫 번째 페르소나를 선택하세요"
            : !compareRight
              ? `"${compareLeft.display_name}" 선택됨 — 비교할 두 번째 페르소나를 선택하세요`
              : "비교 중..."}
        </div>
      )}

      {/* 새 페르소나 생성 폼 */}
      {showNewForm && (
        <Card>
          <CardHeader>
            <CardTitle>새 페르소나 만들기</CardTitle>
            <CardDescription>
              블로그 URL을 입력하면 최근 20편을 수집해 AI가 글쓰기 스타일을 분석합니다.
              게시물이 적으면 정확도가 낮아질 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="https://blog.naver.com/블로그ID"
                value={newBlogUrl}
                onChange={(e) => setNewBlogUrl(e.target.value)}
                disabled={isCreating}
              />
              <Button
                onClick={handleCreate}
                disabled={isCreating || !newBlogUrl.trim()}
              >
                {isCreating ? "분석 중..." : "분석 시작"}
              </Button>
            </div>
            {createMessage && (
              <p className="text-sm text-blue-600">{createMessage}</p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 페르소나 없을 때 */}
      {personas.length === 0 && !showNewForm && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            등록된 페르소나가 없습니다.
            <br />
            블로그 URL을 분석하거나, 아래 예시에서 마음에 드는 스타일을 복사해보세요.
          </CardContent>
        </Card>
      )}

      {/* 내 페르소나 카드 그리드 */}
      {personas.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">내 페르소나</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personas.map((persona) => {
              const status =
                STATUS_LABELS[persona.crawl_status] || STATUS_LABELS.none;

              return (
                <Card
                  key={persona.id}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${
                    compareMode && compareLeft?.id === persona.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={async () => {
                    if (compareMode) {
                      // 비교 모드: 항목 로드 후 비교에 추가
                      const supabase = createClient();
                      const { data } = await supabase
                        .from("persona_items")
                        .select("id, category, key, value, priority")
                        .eq("persona_id", persona.id)
                        .neq("category", "category_prompt")
                        .order("priority", { ascending: false });
                      selectForCompare(toUnified(persona, (data as PersonaItem[]) || []));
                    } else {
                      openMyPersonaPopup(persona.id);
                    }
                  }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {persona.display_name || "이름 없음"}
                      </CardTitle>
                      {persona.is_default && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          기본
                        </span>
                      )}
                    </div>
                    {persona.source_blog_url && (
                      <CardDescription className="truncate text-xs">
                        {persona.source_blog_url}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className={status.color}>{status.text}</span>
                      {persona.crawl_post_count > 0 && (
                        <span className="text-muted-foreground">
                          {persona.crawl_post_count}편
                        </span>
                      )}
                    </div>
                    {persona.crawled_at && (
                      <p className="text-xs text-muted-foreground">
                        분석일:{" "}
                        {new Date(persona.crawled_at).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                    {/* 기본 설정 버튼 */}
                    {!persona.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        disabled={settingDefault === persona.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetDefault(persona.id);
                        }}
                      >
                        {settingDefault === persona.id
                          ? "설정 중..."
                          : "기본으로 설정"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* 예시 페르소나 섹션 */}
      {examples.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">추천 예시</h2>
            <p className="text-sm text-muted-foreground">
              마음에 드는 스타일을 복사하여 바로 사용하세요
            </p>
          </div>

          {/* 카테고리 필터 */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              전체
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
              >
                {CATEGORY_LABELS[cat] || ""} {cat}
              </Button>
            ))}
          </div>

          {/* 예시 카드 그리드 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredExamples.map((example) => (
              <Card
                key={example.id}
                className={`flex flex-col cursor-pointer transition-shadow hover:shadow-md ${
                  compareMode && compareLeft?.id === example.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => {
                  if (compareMode) {
                    selectForCompare(exampleToUnified(example));
                  } else {
                    setExpandedId(example.id);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {CATEGORY_LABELS[example.category] || ""}
                    </span>
                    <CardTitle className="text-base">
                      {example.display_name}
                    </CardTitle>
                  </div>
                  <CardDescription>{example.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between space-y-3">
                  {example.style_preview && (
                    <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground italic leading-relaxed">
                      &ldquo;{example.style_preview}&rdquo;
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      스타일 항목 {example.itemCount}개
                    </span>
                    <Button
                      size="sm"
                      disabled={copyingId === example.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyExample(example.id);
                      }}
                    >
                      {copyingId === example.id
                        ? "복사 중..."
                        : "내 것으로 복사"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 예시 상세 팝업 모달 */}
          <ExampleDetailModal
            example={examples.find((e) => e.id === expandedId) || null}
            onClose={() => setExpandedId(null)}
            onCopy={handleCopyExample}
            copyingId={copyingId}
          />
        </div>
      )}

      {/* 내 페르소나 팝업 모달 */}
      <MyPersonaModal
        persona={personas.find((p) => p.id === myPersonaPopup) || null}
        items={myPersonaItems}
        loading={loadingItems}
        onClose={() => setMyPersonaPopup(null)}
        onEdit={(id) => { setMyPersonaPopup(null); router.push(`/persona/${id}`); }}
      />

      {/* 비교 모달 */}
      <CompareModal
        left={compareLeft}
        right={compareRight}
        onClose={() => { setCompareLeft(null); setCompareRight(null); setCompareMode(false); }}
        onCopyItem={copyItemToPersona}
        copyingItem={copyingItem}
      />
    </div>
  );
}

// ── 카테고리 정렬 순서 ──
const CATEGORY_ORDER = ["voice", "structure", "emoji", "ending", "custom", "forbidden", "formatting"];

function sortCategories([a]: [string, unknown], [b]: [string, unknown]) {
  return CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b);
}

function groupItems(items: PersonaItem[]): Record<string, PersonaItem[]> {
  const grouped: Record<string, PersonaItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  return grouped;
}

// ── 카테고리별 항목 렌더러 (공용) ──
function CategoryItems({ grouped, showKey }: { grouped: Record<string, PersonaItem[]>; showKey?: boolean }) {
  return (
    <div className="space-y-4">
      {Object.entries(grouped)
        .sort(sortCategories)
        .map(([cat, catItems]) => {
          const meta = ITEM_CATEGORY_LABELS[cat] || { label: cat, color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" };
          return (
            <div key={cat} className="space-y-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
                {meta.label}
              </span>
              {catItems
                .sort((a, b) => b.priority - a.priority)
                .map((item, i) => (
                  <div key={i} className="flex gap-2 text-sm pl-1">
                    <span className="text-muted-foreground shrink-0">·</span>
                    {showKey ? (
                      <div>
                        <span className="font-medium">{item.key}</span>
                        <span className="text-muted-foreground"> — {item.value}</span>
                      </div>
                    ) : (
                      <span>{item.value}</span>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
    </div>
  );
}

// ── 예시 페르소나 상세 모달 ──
function ExampleDetailModal({
  example,
  onClose,
  onCopy,
  copyingId,
}: {
  example: ExamplePersona | null;
  onClose: () => void;
  onCopy: (id: string) => void;
  copyingId: string | null;
}) {
  if (!example) return null;
  const grouped = groupItems(example.items);

  return (
    <Modal open={!!example} onClose={onClose}>
      <ModalHeader
        title={example.display_name}
        subtitle={example.description}
        icon={<span className="text-2xl">{CATEGORY_LABELS[example.category] || ""}</span>}
        onClose={onClose}
      />
      {example.style_preview && (
        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground italic leading-relaxed mb-4">
          &ldquo;{example.style_preview}&rdquo;
        </div>
      )}
      <CategoryItems grouped={grouped} />
      <ModalFooter>
        <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
        <Button size="sm" disabled={copyingId === example.id} onClick={() => onCopy(example.id)}>
          {copyingId === example.id ? "복사 중..." : "내 것으로 복사"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ── 내 페르소나 상세 모달 ──
function MyPersonaModal({
  persona,
  items,
  loading,
  onClose,
  onEdit,
}: {
  persona: Persona | null;
  items: PersonaItem[];
  loading: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  if (!persona) return null;
  const grouped = groupItems(items);

  return (
    <Modal open={!!persona} onClose={onClose}>
      <ModalHeader
        title={persona.display_name || "이름 없음"}
        subtitle={persona.source_blog_url || undefined}
        onClose={onClose}
      />
      {loading ? (
        <p className="text-center text-muted-foreground py-8">로딩 중...</p>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">스타일 항목이 없습니다. 블로그를 분석해보세요.</p>
      ) : (
        <CategoryItems grouped={grouped} showKey />
      )}
      <ModalFooter>
        <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
        <Button size="sm" onClick={() => onEdit(persona.id)}>수정하기</Button>
      </ModalFooter>
    </Modal>
  );
}

// ── 비교 모달 ──
function CompareModal({
  left,
  right,
  onClose,
  onCopyItem,
  copyingItem,
}: {
  left: UnifiedPersona | null;
  right: UnifiedPersona | null;
  onClose: () => void;
  onCopyItem: (item: PersonaItem, targetId: string) => void;
  copyingItem: boolean;
}) {
  if (!left || !right) return null;

  function renderSide(p: UnifiedPersona, other: UnifiedPersona) {
    const grouped = groupItems(p.items);
    const otherKeys = new Set(other.items.map((i) => `${i.category}:${i.key}`));

    return (
      <div className="flex-1 min-w-0">
        <div className="mb-3 pb-2 border-b">
          <h4 className="font-semibold">{p.display_name}</h4>
          <p className="text-xs text-muted-foreground">
            {p.type === "example" ? `예시 (${p.category})` : "내 페르소나"} — {p.items.length}개 항목
          </p>
        </div>
        <div className="space-y-3">
          {Object.entries(grouped)
            .sort(sortCategories)
            .map(([cat, catItems]) => {
              const meta = ITEM_CATEGORY_LABELS[cat] || { label: cat, color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" };
              return (
                <div key={cat} className="space-y-1">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                    {meta.label}
                  </span>
                  {catItems
                    .sort((a, b) => b.priority - a.priority)
                    .map((item, i) => {
                      const existsInOther = otherKeys.has(`${item.category}:${item.key}`);
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-1 text-sm pl-1 group ${existsInOther ? "opacity-50" : ""}`}
                        >
                          <span className="text-muted-foreground shrink-0">·</span>
                          <span className="flex-1 text-xs">{item.value}</span>
                          {other.type === "mine" && !existsInOther && (
                            <button
                              className="shrink-0 text-xs text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                              aria-label={`${other.display_name}에 복사`}
                              disabled={copyingItem}
                              onClick={() => onCopyItem(item, other.id)}
                            >
                              →복사
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-4xl">
      <ModalHeader title="페르소나 비교" onClose={onClose} />
      <p className="text-xs text-muted-foreground mb-4">
        상대 페르소나에 없는 항목에 hover하면 &quot;→복사&quot; 버튼이 나타납니다 (내 페르소나에만 복사 가능)
      </p>
      <div className="flex flex-col md:flex-row gap-6">
        {renderSide(left, right)}
        <div className="hidden md:block w-px bg-border shrink-0" />
        <div className="md:hidden w-full h-px bg-border" />
        {renderSide(right, left)}
      </div>
      <ModalFooter>
        <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
      </ModalFooter>
    </Modal>
  );
}
