import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * DELETE /api/posts?id=xxx
 * 글 삭제 — 소유권 확인 후 generation_queue 행 + Storage 사진 삭제
 */
export async function DELETE(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get("id");
  if (!postId) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

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

  const admin = createAdminClient();

  // 2. 글 존재 + 소유권 확인
  const { data: post } = await admin
    .from("generation_queue")
    .select("id, user_id, input_photos")
    .eq("id", postId)
    .single();

  if (!post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  }

  if (post.user_id !== user.id) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  // 3. Storage 사진 삭제
  const photoPaths = (post.input_photos as string[]) || [];
  if (photoPaths.length > 0) {
    const { error: storageError } = await admin.storage
      .from("photos")
      .remove(photoPaths);
    if (storageError) {
      console.error("Storage 사진 삭제 실패:", storageError);
    }
  }

  // 4. DB 행 삭제
  const { error: deleteError } = await admin
    .from("generation_queue")
    .delete()
    .eq("id", postId);

  if (deleteError) {
    console.error("글 삭제 실패:", deleteError);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/posts
 * 글 수정 — 제목/본문/해시태그 업데이트
 */
export async function PATCH(req: NextRequest) {
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

  const body = await req.json();
  const { id, title, body: postBody, hashtags, versions } = body as {
    id: string;
    title?: string;
    body?: string;
    hashtags?: string[];
    versions?: unknown[];
  };

  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. 소유권 확인
  const { data: post } = await admin
    .from("generation_queue")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!post || post.user_id !== user.id) {
    return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
  }

  // 3. 업데이트
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.generated_title = title;
  if (postBody !== undefined) updates.generated_body = postBody;
  if (hashtags !== undefined) updates.generated_hashtags = hashtags;
  if (versions !== undefined) updates.versions = versions;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다" }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("generation_queue")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    console.error("글 수정 실패:", updateError);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
