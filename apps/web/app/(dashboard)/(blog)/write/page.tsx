"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
import { compressImage } from "@/lib/image-compress";
import { WritingFeedback } from "@/components/writing-feedback";

const categories = ["맛집", "카페", "여행", "일상", "기타"];

interface PhotoFile {
  file: File | null; // null = DB에서 불러온 사진
  preview: string; // blob URL 또는 Storage public URL
  storagePath?: string;
}

interface DraftVersion {
  version: number;
  title: string;
  body: string;
  hashtags: string[];
  feedback: string | null; // v1은 null, v2+는 수정 요청 내용
  created_at: string;
}

function WritePageContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const calendarTopic = searchParams.get("topic");
  const calendarCategory = searchParams.get("category");

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
  const [isUpdating, setIsUpdating] = useState(false);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copyLabel, setCopyLabel] = useState("복사하기");
  const [htmlCopyLabel, setHtmlCopyLabel] = useState("HTML 복사");
  const [isEditMode, setIsEditMode] = useState(false);
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(0); // 0 = 최신 (draft)
  const [cachedFormatting, setCachedFormatting] = useState<FormattingItem[]>([]);
  const [cachedPhotoUrls, setCachedPhotoUrls] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    postUrl?: string;
    message: string;
  } | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaveResult, setDraftSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [quota, setQuota] = useState<{
    used: number;
    limit: number;
    tier: string;
  } | null>(null);
  const [personaList, setPersonaList] = useState<
    { id: string; display_name: string; is_default: boolean }[]
  >([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(
    null
  );
  const [showWritingFeedback, setShowWritingFeedback] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // isDirty: 저장되지 않은 작업 내용이 있는지 판정
  const isDirty =
    !savedId &&
    (photos.length > 0 || memo.trim() !== "" || draft !== null);

  // 이탈 방지: beforeunload + pushState 패치 + popstate
  useEffect(() => {
    if (!isDirty) return;

    // 1) 브라우저 닫기/새로고침
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // 2) Next.js 내부 네비게이션 (Link 클릭 → pushState)
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (state, title, url) {
      if (
        window.confirm("작성 중인 내용이 사라집니다. 이동하시겠습니까?")
      ) {
        return originalPushState(state, title, url);
      }
    } as typeof history.pushState;

    // 3) 브라우저 뒤로/앞으로
    const handlePopState = () => {
      if (
        !window.confirm("작성 중인 내용이 사라집니다. 이동하시겠습니까?")
      ) {
        history.pushState(null, "", location.href);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      history.pushState = originalPushState;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isDirty]);

  // 캘린더에서 넘어온 주제/카테고리 초기값 설정
  useEffect(() => {
    if (calendarTopic && !memo) setMemo(calendarTopic);
    if (calendarCategory && !category) setCategory(calendarCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarTopic, calendarCategory]);

  // 사용량 + 페르소나 formatting 항목 로드 (캐싱)
  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 사용량
      const { data } = await supabase
        .from("users")
        .select("tier, monthly_gen_count, gen_count_reset_month")
        .eq("id", user.id)
        .single();

      if (data) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const used =
          data.gen_count_reset_month === currentMonth
            ? data.monthly_gen_count || 0
            : 0;
        const tier = (data.tier || "free") as string;
        const limits: Record<string, number> = { free: 10, basic: 50, pro: 200 };
        setQuota({ used, limit: limits[tier] || 10, tier });
      }

      // 페르소나 목록 로드 + formatting 항목 캐싱
      try {
        const pRes = await fetch("/api/persona/list");
        if (pRes.ok) {
          const pData = await pRes.json();
          const list = (pData.personas || []) as {
            id: string;
            display_name: string;
            is_default: boolean;
            crawl_status: string;
          }[];
          // 분석 완료된 페르소나만 표시
          const doneList = list.filter((p) => p.crawl_status === "done");
          setPersonaList(doneList);
          // 기본 페르소나 자동 선택
          const defaultP = doneList.find((p) => p.is_default);
          if (defaultP) setSelectedPersonaId(defaultP.id);
        }
      } catch {
        // 페르소나 목록 로드 실패 무시
      }

      const { data: persona } = await supabase
        .from("user_personas")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (persona) {
        const { data: items } = await supabase
          .from("persona_items")
          .select("category, key, value, priority, is_active")
          .eq("persona_id", persona.id)
          .eq("category", "formatting")
          .eq("is_active", true);
        if (items) setCachedFormatting(items as FormattingItem[]);
      }
    }
    loadInitialData();
  }, []);

  // 저장된 글 불러오기 (?id=xxx)
  useEffect(() => {
    if (!editId) return;

    async function loadPost() {
      const supabase = createClient();
      const { data } = await supabase
        .from("generation_queue")
        .select("*")
        .eq("id", editId)
        .single();
      if (!data) return;

      const paths = (data.input_photos as string[]) || [];

      // private 버킷이므로 signed URL로 미리보기 생성
      let previewUrls: string[] = [];
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("photos")
          .createSignedUrls(paths, 3600);
        previewUrls = (signed || []).map((s) => s.signedUrl);
      }

      setPhotos(
        paths.map((p, i) => ({
          file: null,
          preview: previewUrls[i] || "",
          storagePath: p,
        }))
      );
      setUploadedPaths(paths);
      setMemo(data.input_memo || "");
      setCategory(data.input_category || null);
      if (data.generated_title && data.generated_body) {
        setDraft({
          title: data.generated_title,
          body: data.generated_body,
          hashtags: (data.generated_hashtags as string[]) || [],
        });
      }
      // 버전 히스토리 복원
      const savedVersions = (data.versions as DraftVersion[]) || [];
      if (savedVersions.length > 0) {
        setVersions(savedVersions);
      }
      setSavedId(data.id);
    }
    loadPost();
  }, [editId]);

  // 사진 signed URL 캐싱 (uploadedPaths 변경 시)
  useEffect(() => {
    if (uploadedPaths.length === 0) {
      setCachedPhotoUrls([]);
      return;
    }
    async function cacheSignedUrls() {
      const supabase = createClient();
      const { data: signed } = await supabase.storage
        .from("photos")
        .createSignedUrls(uploadedPaths, 3600);
      setCachedPhotoUrls((signed || []).map((s) => s.signedUrl));
    }
    cacheSignedUrls();
  }, [uploadedPaths]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const toProcess = files.slice(0, 10 - photos.length);

    // 압축 처리 (병렬)
    const compressed = await Promise.all(toProcess.map(compressImage));

    const newPhotos = compressed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newPhotos].slice(0, 10));
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const photo = prev[index];
      if (photo.file) URL.revokeObjectURL(photo.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setPhotos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
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

        if (!photo.file) continue;

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
          personaId: selectedPersonaId || undefined,
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
      const newDraft = {
        title: result.title,
        body: result.body,
        hashtags: result.hashtags,
      };
      setDraft(newDraft);
      setVersions([{
        version: 1,
        title: newDraft.title,
        body: newDraft.body,
        hashtags: newDraft.hashtags,
        feedback: null,
        created_at: new Date().toISOString(),
      }]);
      setCurrentVersion(0);
      setUploadedPaths(paths);
      setSavedId(null);
      setQuota((prev) => (prev ? { ...prev, used: prev.used + 1 } : null));
      setCurrentGenerationId(result.id || null);
      setShowWritingFeedback(true);
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
      // 이미지 URL → base64 data URI 변환 (네이버 paste 시 이미지 포함)
      setHtmlCopyLabel("이미지 변환중...");
      const base64Urls = await Promise.all(
        cachedPhotoUrls.map(async (url) => {
          if (!url) return url;
          try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch {
            return url; // 변환 실패 시 원본 URL 유지
          }
        })
      );

      const html = renderPostHtml(
        draft.title,
        draft.body,
        base64Urls,
        cachedFormatting
      );

      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob(
        [draft.title + "\n\n" + draft.body.replace(/\[PHOTO_\d+\]/g, "").trim()],
        { type: "text/plain" }
      );
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);

      setHtmlCopyLabel("복사됨!");
      setTimeout(() => setHtmlCopyLabel("HTML 복사"), 2000);
    } catch {
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
          versions: versions.length > 0 ? versions : undefined,
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

  async function handleUpdate() {
    if (!draft || !savedId) return;
    setIsUpdating(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedId,
          title: draft.title,
          body: draft.body,
          hashtags: draft.hashtags,
          versions: versions.length > 0 ? versions : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "수정 실패");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정 중 오류가 발생했습니다");
    } finally {
      setIsUpdating(false);
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
          personaId: selectedPersonaId || undefined,
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
      const newDraft = {
        title: result.title,
        body: result.body,
        hashtags: result.hashtags,
      };

      // 이전 버전 보존
      const nextVersion = versions.length + 1;
      setVersions((prev) => [
        ...prev,
        {
          version: nextVersion,
          title: newDraft.title,
          body: newDraft.body,
          hashtags: newDraft.hashtags,
          feedback: feedback.trim(),
          created_at: new Date().toISOString(),
        },
      ]);
      setCurrentVersion(0); // 최신 보기

      setDraft(newDraft);
      setFeedback("");
      setSavedId(null);
      setQuota((prev) => (prev ? { ...prev, used: prev.used + 1 } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "재생성 중 오류가 발생했습니다");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handlePublish() {
    if (!draft || !savedId) return;
    setIsPublishing(true);
    setPublishResult(null);
    setError(null);

    try {
      // 1. publish 명령을 bot_commands 큐에 등록
      const res = await fetch("/api/bot/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "publish",
          payload: {
            queue_id: savedId,
            title: draft.title,
            body: draft.body,
            hashtags: draft.hashtags,
            image_paths: [], // 로컬 이미지는 워커가 처리하지 않음 (스마트에디터에서 업로드)
            category: category,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "발행 명령 등록 실패");
      }

      // 2. 폴링으로 완료 대기 (최대 5분, 5초 간격)
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const pollRes = await fetch("/api/bot/command");
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json();
        const publishCmd = (pollData.commands || []).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => c.command === "publish" && c.payload?.queue_id === savedId
        );

        if (!publishCmd) continue;

        if (publishCmd.status === "completed") {
          const postUrl = publishCmd.result?.post_url;
          setPublishResult({
            success: true,
            postUrl,
            message: "네이버 블로그에 발행되었습니다!",
          });
          return;
        }

        if (publishCmd.status === "failed") {
          throw new Error(publishCmd.error_message || "발행 실패");
        }

        // pending/running — 계속 대기
      }

      throw new Error("발행 시간 초과 (5분). 워커가 실행 중인지 확인하세요.");
    } catch (e) {
      setPublishResult({
        success: false,
        message: e instanceof Error ? e.message : "발행 중 오류가 발생했습니다",
      });
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleSaveDraft() {
    if (!draft || !savedId) return;
    setIsSavingDraft(true);
    setDraftSaveResult(null);
    setError(null);

    try {
      // HTML 생성 (본문만 — 제목은 에디터 제목란에 별도 입력)
      const { renderToNaverHtml, buildRenderConfig } = await import("@/lib/render/naver-html");
      const config = buildRenderConfig(cachedFormatting);
      // 제목은 빈 문자열로 전달 (save_draft가 에디터 제목란에 직접 입력하므로 중복 방지)
      const bodyHtml = renderToNaverHtml("", draft.body, cachedPhotoUrls, config);

      // save_draft 명령을 bot_commands 큐에 등록
      const res = await fetch("/api/bot/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "save_draft",
          payload: {
            queue_id: savedId,
            title: draft.title,
            body_html: bodyHtml,
            hashtags: draft.hashtags,
            image_paths: [],
            photo_urls: cachedPhotoUrls,
            category: category,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "임시저장 명령 등록 실패");
      }

      // 폴링으로 완료 대기 (최대 5분, 5초 간격)
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const pollRes = await fetch("/api/bot/command");
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json();
        const draftCmd = (pollData.commands || []).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => c.command === "save_draft" && c.payload?.queue_id === savedId
        );

        if (!draftCmd) continue;

        if (draftCmd.status === "completed") {
          setDraftSaveResult({
            success: true,
            message: "네이버 블로그에 임시저장되었습니다! 네이버에서 확인 후 발행하세요.",
          });
          return;
        }

        if (draftCmd.status === "failed") {
          throw new Error(draftCmd.error_message || "임시저장 실패");
        }
      }

      throw new Error("임시저장 시간 초과 (5분). 워커가 실행 중인지 확인하세요.");
    } catch (e) {
      setDraftSaveResult({
        success: false,
        message: e instanceof Error ? e.message : "임시저장 중 오류가 발생했습니다",
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  return (
    <div className={`space-y-6 ${draft ? "pb-24" : ""}`}>
      {/* 피드백 수집 (AI 글 생성 후) */}
      {showWritingFeedback && draft && (
        <WritingFeedback
          generationId={currentGenerationId || undefined}
          onClose={() => setShowWritingFeedback(false)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold">
          {editId ? "저장된 글 보기" : "새 글 쓰기"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {editId
            ? "이전에 저장한 글을 확인하고 수정할 수 있습니다"
            : "사진과 메모를 입력하면 AI가 블로그 글을 작성해드립니다"}
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
                    <div
                      key={i}
                      className={`group relative aspect-square cursor-grab active:cursor-grabbing ${
                        dragIndex === i ? "opacity-40" : ""
                      } ${dragOverIndex === i && dragIndex !== i ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDrop={() => handleDrop(i)}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    >
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
                        className="absolute right-1 top-1 block rounded bg-black/60 px-1.5 py-0.5 text-xs text-white sm:hidden group-hover:block"
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

          {/* 페르소나 선택 */}
          {personaList.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">페르소나</CardTitle>
                <CardDescription>
                  글쓰기 스타일을 선택합니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedPersonaId || ""}
                  onChange={(e) =>
                    setSelectedPersonaId(e.target.value || null)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">기본 페르소나</option>
                  {personaList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || "이름 없음"}
                      {p.is_default ? " (기본)" : ""}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          )}

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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">AI 초안</CardTitle>
                      <button
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                          isEditMode
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {isEditMode ? "미리보기" : "편집"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        {copyLabel}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleCopyHtml}>
                        {htmlCopyLabel}
                      </Button>
                      {savedId ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleUpdate}
                            disabled={isUpdating}
                          >
                            {isUpdating ? "저장 중..." : "수정 저장"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSaveDraft}
                            disabled={isSavingDraft || draftSaveResult?.success === true || isPublishing}
                          >
                            {isSavingDraft
                              ? "저장 중..."
                              : draftSaveResult?.success
                                ? "임시저장 완료"
                                : "네이버 임시저장"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={handlePublish}
                            disabled={isPublishing || publishResult?.success === true || isSavingDraft}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {isPublishing
                              ? "발행 중..."
                              : publishResult?.success
                                ? "발행 완료"
                                : "네이버 발행"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? "저장 중..." : "저장"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 버전 히스토리 */}
                  {versions.length > 1 && (
                    <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground">버전</span>
                      <div className="flex gap-1">
                        {versions.map((v) => (
                          <button
                            key={v.version}
                            onClick={() => {
                              if (v.version === versions.length) {
                                // 최신 버전 = 현재 draft
                                setCurrentVersion(0);
                              } else {
                                setCurrentVersion(v.version);
                                setDraft({
                                  title: v.title,
                                  body: v.body,
                                  hashtags: v.hashtags,
                                });
                              }
                            }}
                            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                              (currentVersion === 0 && v.version === versions.length) ||
                              currentVersion === v.version
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                            }`}
                            title={v.feedback ? `수정 요청: ${v.feedback}` : "초안"}
                          >
                            v{v.version}
                          </button>
                        ))}
                      </div>
                      {currentVersion > 0 && currentVersion < versions.length && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          이전 버전 보기 중
                        </span>
                      )}
                    </div>
                  )}

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
                      본문 {isEditMode && <span className="text-muted-foreground/60">([PHOTO_N] = 사진 위치)</span>}
                    </label>
                    {isEditMode ? (
                      <textarea
                        value={draft.body}
                        onChange={(e) =>
                          setDraft({ ...draft, body: e.target.value })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                        rows={Math.max(15, draft.body.split("\n").length + 2)}
                      />
                    ) : (
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
                    )}
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

                  {/* 발행 결과 */}
                  {publishResult && (
                    <div
                      className={`rounded-lg p-4 ${
                        publishResult.success
                          ? "bg-green-50 border border-green-200"
                          : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <p
                        className={`text-sm font-medium ${
                          publishResult.success ? "text-green-800" : "text-red-800"
                        }`}
                      >
                        {publishResult.success ? "✅" : "❌"} {publishResult.message}
                      </p>
                      {publishResult.postUrl && (
                        <a
                          href={publishResult.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-sm text-green-700 underline hover:text-green-900"
                        >
                          블로그에서 보기 →
                        </a>
                      )}
                    </div>
                  )}

                  {/* 임시저장 결과 */}
                  {draftSaveResult && (
                    <div
                      className={`rounded-lg p-4 ${
                        draftSaveResult.success
                          ? "bg-blue-50 border border-blue-200"
                          : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <p
                        className={`text-sm font-medium ${
                          draftSaveResult.success ? "text-blue-800" : "text-red-800"
                        }`}
                      >
                        {draftSaveResult.success ? "✅" : "❌"} {draftSaveResult.message}
                      </p>
                    </div>
                  )}

                  {/* 임시저장 진행 중 표시 */}
                  {isSavingDraft && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                      <p className="text-sm text-blue-800">
                        ⏳ 네이버 블로그에 임시저장 중입니다... (최대 5분 소요)
                      </p>
                      <p className="mt-1 text-xs text-blue-600">
                        로컬 워커가 Playwright로 스마트에디터에 HTML을 주입하고 있습니다.
                      </p>
                    </div>
                  )}

                  {/* 발행 진행 중 표시 */}
                  {isPublishing && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                      <p className="text-sm text-blue-800">
                        ⏳ 네이버 블로그에 발행 중입니다... (최대 5분 소요)
                      </p>
                      <p className="mt-1 text-xs text-blue-600">
                        로컬 워커가 Playwright로 스마트에디터를 조작하고 있습니다.
                      </p>
                    </div>
                  )}
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

      {/* 플로팅 피드백 바 */}
      {draft && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-5xl items-end gap-3 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <Textarea
              className="min-h-[40px] flex-1 resize-none"
              placeholder="수정 요청: 예) 두번째 문단 더 자세하게, 이모지 줄여줘"
              rows={1}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onFocus={(e) => (e.target.rows = 3)}
              onBlur={(e) => {
                if (!e.target.value) e.target.rows = 1;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleRegenerate();
                }
              }}
            />
            <div className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                disabled={
                  !feedback.trim() ||
                  isRegenerating ||
                  (quota !== null && quota.used >= quota.limit)
                }
                onClick={handleRegenerate}
              >
                {isRegenerating ? "수정 중..." : "재생성"}
              </Button>
              {quota && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {quota.used}/{quota.limit}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WritePage() {
  return (
    <Suspense>
      <WritePageContent />
    </Suspense>
  );
}
