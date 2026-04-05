"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  none: { text: "미분석", color: "text-muted-foreground" },
  crawling: { text: "크롤링 중...", color: "text-blue-600" },
  analyzing: { text: "AI 분석 중...", color: "text-blue-600" },
  done: { text: "분석 완료", color: "text-primary" },
  error: { text: "오류", color: "text-destructive" },
};

// ── 메인 페이지 ──

export default function PersonaListPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBlogUrl, setNewBlogUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

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

  useEffect(() => {
    loadPersonas();
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
        <Button
          onClick={() => setShowNewForm(!showNewForm)}
          disabled={isCreating}
        >
          {showNewForm ? "취소" : "새 페르소나 추가"}
        </Button>
      </div>

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
            &quot;새 페르소나 추가&quot; 버튼을 클릭하여 블로그 스타일을 분석해보세요.
          </CardContent>
        </Card>
      )}

      {/* 페르소나 카드 그리드 */}
      {personas.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => {
            const status =
              STATUS_LABELS[persona.crawl_status] || STATUS_LABELS.none;

            return (
              <Card
                key={persona.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(`/persona/${persona.id}`)}
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
      )}
    </div>
  );
}
