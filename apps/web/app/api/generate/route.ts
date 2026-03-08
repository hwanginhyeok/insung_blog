import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { generatePost } from "@/lib/ai/generate-post";
import { createAdminClient } from "@/lib/supabase-admin";
import { reserveUsage, rollbackUsage } from "@/lib/tier";

export const maxDuration = 60; // Vercel Pro: 최대 60초 (AI 4단계 호출)

/**
 * POST /api/generate
 * Body: { photoPaths: string[], memo: string, category: string | null }
 *
 * 사진을 Storage에서 다운로드 → base64 변환 → Claude 4단계 파이프라인 → 초안 반환
 */
export async function POST(req: NextRequest) {
  // 1. 인증 확인
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 2. 원자적 사용량 예약 (체크 + 증분 동시)
  const usage = await reserveUsage(user.id);
  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: `이번 달 생성 한도(${usage.limit}회)를 초과했습니다`,
        usageExceeded: true,
        usage,
      },
      { status: 429 }
    );
  }

  // 3. 요청 파싱
  const body = await req.json();
  const { photoPaths, memo, category } = body as {
    photoPaths: string[];
    memo: string;
    category: string | null;
  };

  if (!photoPaths?.length) {
    return NextResponse.json(
      { error: "사진이 필요합니다" },
      { status: 400 }
    );
  }

  // 4. Storage에서 사진 다운로드 → base64 변환
  const admin = createAdminClient();
  const photos: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }[] = [];

  for (const photoPath of photoPaths) {
    const { data, error } = await admin.storage
      .from("photos")
      .download(photoPath);

    if (error || !data) {
      console.error(`사진 다운로드 실패: ${photoPath}`, error);
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const base64 = buffer.toString("base64");

    // MIME 타입 추출
    let mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
    if (photoPath.endsWith(".png")) mediaType = "image/png";
    else if (photoPath.endsWith(".webp")) mediaType = "image/webp";

    photos.push({ base64, mediaType });
  }

  if (photos.length === 0) {
    return NextResponse.json(
      { error: "유효한 사진이 없습니다" },
      { status: 400 }
    );
  }

  // 5. AI 초안 생성 (사용량은 이미 예약됨 — 실패 시 원복)
  try {
    const result = await generatePost(photos, memo || "", category, user.id);
    return NextResponse.json(result);
  } catch (e) {
    await rollbackUsage(user.id);
    const message = e instanceof Error ? e.message : "AI 생성 실패";
    console.error("AI 생성 오류:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
