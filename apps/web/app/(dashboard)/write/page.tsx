"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { renderPostHtml } from "@/lib/render/naver-html";
import type { FormattingItem } from "@/lib/render/naver-html";

const categories = ["맛집", "카페", "여행", "일상", "기타"];

interface PhotoFile {
  file: File;
  preview: string;
  storagePath?: string; // Storage 업로드 후 경로
}

export default function WritePage() {
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [memo, setMemo] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    title: string;
    body: string;
    hashtags: string[];
  } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copyLabel, setCopyLabel] = useState("복사하기");
  const [htmlCopyLabel, setHtmlCopyLabel] = useState("HTML 복사");
  const [quota, setQuota] = useState<{
    used: number;
    limit: number;
    tier: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사용량 로드
  useEffect(() => {
    async function loadQuota() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("tier, monthly_gen_count, gen_count_reset_month")
        .eq("id", user.id)
        .single();

      if (!data) return;

      const currentMonth = new Date().toISOString().slice(0, 7);
      const used =
        data.gen_count_reset_month === currentMonth
          ? data.monthly_gen_count || 0
          : 0;

      const tier = (data.tier || "free") as string;
      const limits: Record<string, number> = { free: 10, basic: 50, pro: 200 };

      setQuota({ used, limit: limits[tier] || 10, tier });
    }
    loadQuota();
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const newPhotos = files.slice(0, 10 - photos.length).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newPhotos].slice(0, 10));
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleGenerate() {
    if (photos.length === 0) return;
    setIsGenerating(true);
    setError(null);

    try {
      // Step 1: 사진을 Supabase Storage에 업로드
      setGenerateStatus("사진 업로드 중...");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");

      const paths: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo.storagePath) {
          paths.push(photo.storagePath);
          continue;
        }

        const ext = photo.file.name.split(".").pop() || "jpg";
        const storagePath = `${user.id}/${Date.now()}_${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(storagePath, photo.file);

        if (uploadError) throw new Error(`사진 업로드 실패: ${uploadError.message}`);

        paths.push(storagePath);
        // 경로 캐시 (재생성 시 재업로드 방지)
        setPhotos((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, storagePath } : p
          )
        );
      }

      // Step 2: AI 초안 생성 API 호출
      setGenerateStatus("AI가 사진을 분석하고 있어요...");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoPaths: paths,
          memo,
          category,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.usageExceeded && err.usage) {
          setQuota((prev) =>
            prev
              ? { ...prev, used: err.usage.used, limit: err.usage.limit }
              : null
          );
        }
        throw new Error(err.error || "AI 생성 실패");
      }

      const result = await res.json();
      setDraft({
        title: result.title,
        body: result.body,
        hashtags: result.hashtags,
      });
      setUploadedPaths(paths);
      setSavedId(null);
      setQuota((prev) => (prev ? { ...prev, used: prev.used + 1 } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setIsGenerating(false);
      setGenerateStatus("");
    }
  }

  function handleCopy() {
    if (!draft) return;
    const cleanBody = draft.body
      .replace(/\[PHOTO_\d+\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const text = `${draft.title}\n\n${cleanBody}\n\n${draft.hashtags.map((t) => `#${t}`).join(" ")}`;
    navigator.clipboard.writeText(text);
    setCopyLabel("복사됨!");
    setTimeout(() => setCopyLabel("복사하기"), 2000);
  }

  async function handleCopyHtml() {
    if (!draft) return;

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 페르소나 formatting 항목 로드 (없으면 기본값으로 렌더링)
      let formattingItems: FormattingItem[] = [];
      if (user) {
        const { data: persona } = await supabase
          .from("user_personas")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (persona) {
          const { data: items } = await supabase
            .from("persona_items")
            .select("category, key, value, priority, is_active")
            .eq("persona_id", persona.id)
            .eq("category", "formatting")
            .eq("is_active", true);
          if (items) formattingItems = items as FormattingItem[];
        }
      }

      // 사진 public URL 생성
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const photoUrls = uploadedPaths.map(
        (p) => `${supabaseUrl}/storage/v1/object/public/photos/${p}`
      );

      // HTML 렌더링
      const html = renderPostHtml(
        draft.title,
        draft.body,
        photoUrls,
        formattingItems
      );

      // ClipboardItem으로 리치텍스트 복사
      const blob = new Blob([html], { type: "text/html" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": blob }),
      ]);

      setHtmlCopyLabel("복사됨!");
      setTimeout(() => setHtmlCopyLabel("HTML 복사"), 2000);
    } catch {
      // ClipboardItem 미지원 브라우저 폴백
      handleCopy();
    }
  }

  async function handleSave() {
    if (!draft) return;
    setIsSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다");

      const { data, error: insertError } = await supabase
        .from("generation_queue")
        .insert({
          user_id: user.id,
          input_photos: uploadedPaths,
          input_memo: memo || null,
          input_category: category as "맛집" | "여행" | "일상" | "카페" | "기타" | null,
          status: "completed",
          generated_title: draft.title,
          generated_body: draft.body,
          generated_hashtags: draft.hashtags,
          source: "web",
        })
        .select("id")
        .single();

      if (insertError) throw new Error(`저장 실패: ${insertError.message}`);

      setSavedId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!draft || !feedback.trim()) return;
    setIsRegenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousTitle: draft.title,
          previousBody: draft.body,
          feedback: feedback.trim(),
          category: category || "일상",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.usageExceeded && err.usage) {
          setQuota((prev) =>
            prev
              ? { ...prev, used: err.usage.used, limit: err.usage.limit }
              : null
          );
        }
        throw new Error(err.error || "재생성 실패");
      }

      const result = await res.json();
      setDraft({
        title: result.title,
        body: result.body,
        hashtags: result.hashtags,
      });
      setFeedback("");
      setSavedId(null);
      setQuota((prev) => (prev ? { ...prev, used: prev.used + 1 } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "재생성 중 오류가 발생했습니다");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">새 글 쓰기</h1>
        <p className="text-sm text-muted-foreground">
          사진과 메모를 입력하면 AI가 블로그 글을 작성해드립니다
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 왼쪽: 입력 영역 */}
        <div className="space-y-4">
          {/* 사진 업로드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">사진</CardTitle>
              <CardDescription>
                최대 10장, 순서대로 글에 배치됩니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              {photos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((photo, i) => (
                    <div key={i} className="group relative aspect-square">
                      <img
                        src={photo.preview}
                        alt={`사진 ${i + 1}`}
                        className="h-full w-full rounded-md object-cover"
                      />
                      <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                        {i + 1}
                      </div>
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs text-white group-hover:block"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={photos.length >= 10}
              >
                {photos.length === 0
                  ? "사진 선택하기"
                  : `사진 추가 (${photos.length}/10)`}
              </Button>
            </CardContent>
          </Card>

          {/* 메모 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">메모</CardTitle>
              <CardDescription>
                장소, 메뉴, 감상 등을 자유롭게 적어주세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="예: 강남역 3번 출구 돈까스집, 히레카츠 먹었음, 소스가 특히 맛있었어"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>

          {/* 카테고리 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">카테고리</CardTitle>
              <CardDescription>
                선택하지 않으면 AI가 자동 감지합니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    variant={category === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setCategory(category === cat ? null : cat)
                    }
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 사용량 + 생성 버튼 */}
          {quota && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                이번 달 {quota.used}/{quota.limit}회 사용
              </span>
              {quota.used >= quota.limit && (
                <span className="font-medium text-red-500">한도 초과</span>
              )}
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button
            className="w-full"
            size="lg"
            disabled={
              photos.length === 0 ||
              isGenerating ||
              (quota !== null && quota.used >= quota.limit)
            }
            onClick={handleGenerate}
          >
            {isGenerating
              ? generateStatus || "AI가 글을 작성하고 있어요..."
              : quota !== null && quota.used >= quota.limit
                ? "이번 달 한도를 모두 사용했습니다"
                : "AI 초안 생성"}
          </Button>
        </div>

        {/* 오른쪽: 초안 미리보기 */}
        <div className="space-y-4">
          {draft ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">AI 초안</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        {copyLabel}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCopyHtml}>
                        {htmlCopyLabel}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving || !!savedId}
                      >
                        {savedId
                          ? "저장됨"
                          : isSaving
                            ? "저장 중..."
                            : "저장"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 제목 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      제목
                    </label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                      className="w-full rounded-md border bg-background px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  {/* 본문 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      본문
                    </label>
                    <div className="space-y-3">
                      {draft.body.split("\n\n").map((paragraph, i) => {
                        const photoMatch = paragraph.match(
                          /^\[PHOTO_(\d+)\]$/
                        );
                        if (photoMatch) {
                          const photoIdx = parseInt(photoMatch[1]) - 1;
                          const photo = photos[photoIdx];
                          if (photo) {
                            return (
                              <div
                                key={i}
                                className="overflow-hidden rounded-lg"
                              >
                                <img
                                  src={photo.preview}
                                  alt={`사진 ${photoIdx + 1}`}
                                  className="w-full"
                                />
                              </div>
                            );
                          }
                        }
                        return (
                          <p
                            key={i}
                            className="text-sm leading-relaxed text-foreground"
                          >
                            {paragraph}
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {/* 해시태그 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      해시태그
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.hashtags.map((tag, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-secondary px-2.5 py-1 text-xs"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 재생성 */}
              <Card>
                <CardContent className="pt-6">
                  <Textarea
                    placeholder="수정 요청: 예) 두번째 문단 좀 더 자세하게, 이모지 줄여줘"
                    rows={2}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="mt-2 w-full"
                    size="sm"
                    disabled={
                      !feedback.trim() ||
                      isRegenerating ||
                      (quota !== null && quota.used >= quota.limit)
                    }
                    onClick={handleRegenerate}
                  >
                    {isRegenerating
                      ? "수정 중..."
                      : quota !== null && quota.used >= quota.limit
                        ? "한도 초과"
                        : "피드백으로 재생성"}
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="flex min-h-[400px] items-center justify-center">
              <CardContent className="text-center">
                <p className="text-lg text-muted-foreground">
                  사진을 올리고 AI 초안을 생성해보세요
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI가 당신의 스타일로 블로그 글을 작성해드립니다
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
