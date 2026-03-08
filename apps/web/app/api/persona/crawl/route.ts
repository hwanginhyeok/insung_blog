import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { extractBlogId, crawlBlog } from "@/lib/crawl/naver-blog";

export const maxDuration = 60; // 20편 크롤링 ~15-25초

/**
 * POST /api/persona/crawl
 * Body: { blogUrl: string }
 *
 * 블로그 URL → blogId 추출 → 모바일 페이지 크롤링 → HTML 메타데이터 포함 반환
 *
 * 흐름:
 *  1. 인증 확인
 *  2. blogId 추출 + 유효성 검증
 *  3. user_personas upsert (crawl_status → 'crawling')
 *  4. crawlBlog() 실행 (최대 20편)
 *  5. crawl_status → 'analyzing' (AI 분석 대기)
 *  6. 크롤링 결과 반환 → 클라이언트가 /api/persona/analyze 호출
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

  // 2. 요청 파싱 + blogId 추출
  const body = await req.json();
  const { blogUrl } = body as { blogUrl: string };

  if (!blogUrl?.trim()) {
    return NextResponse.json(
      { error: "블로그 URL이 필요합니다" },
      { status: 400 }
    );
  }

  const blogId = extractBlogId(blogUrl.trim());
  if (!blogId) {
    return NextResponse.json(
      { error: "유효하지 않은 블로그 URL입니다" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 3. user_personas upsert (crawl_status → 'crawling')
  const { data: existing } = await admin
    .from("user_personas")
    .select("id")
    .eq("user_id", user.id)
    .single();

  let personaId: string;

  if (existing) {
    personaId = existing.id;

    // 기존 페르소나 업데이트 (재크롤링)
    await admin
      .from("user_personas")
      .update({
        source_blog_url: blogUrl.trim(),
        crawl_status: "crawling",
        crawl_error: null,
      })
      .eq("id", personaId);

    // 기존 AI 항목 삭제 (재분석 시 새로 생성)
    await admin
      .from("persona_items")
      .delete()
      .eq("persona_id", personaId)
      .eq("source", "ai");
  } else {
    // 신규 페르소나 생성
    const { data: created, error: insertError } = await admin
      .from("user_personas")
      .insert({
        user_id: user.id,
        source_blog_url: blogUrl.trim(),
        crawl_status: "crawling",
      })
      .select("id")
      .single();

    if (insertError || !created) {
      console.error("페르소나 생성 실패:", insertError);
      return NextResponse.json(
        { error: "페르소나 생성 실패" },
        { status: 500 }
      );
    }
    personaId = created.id;
  }

  // 4. 크롤링 실행
  try {
    const result = await crawlBlog(blogId, 20);

    // 5. 크롤링 완료 → 'analyzing' (AI 분석 대기)
    await admin
      .from("user_personas")
      .update({
        crawl_status: "analyzing",
        crawl_post_count: result.posts.length,
        crawled_at: new Date().toISOString(),
      })
      .eq("id", personaId);

    return NextResponse.json({
      personaId,
      blogId: result.blogId,
      postCount: result.posts.length,
      posts: result.posts,
      fontSummary: result.fontSummary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "크롤링 실패";
    console.error("크롤링 오류:", e);

    // 에러 상태 기록
    await admin
      .from("user_personas")
      .update({
        crawl_status: "error",
        crawl_error: message,
      })
      .eq("id", personaId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
