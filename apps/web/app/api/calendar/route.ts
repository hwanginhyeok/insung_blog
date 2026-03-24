import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/calendar?year=2026&month=3
 * 월별 캘린더 데이터 반환 (content_calendar + generation_queue 병합)
 */
export async function GET(req: NextRequest) {
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

  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") || String(new Date().getMonth() + 1));

  // 해당 월의 시작/끝 날짜
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // 캘린더 이벤트 조회
  const { data: events } = await supabase
    .from("content_calendar")
    .select("id, planned_date, topic, category, memo, status, generation_id, created_at")
    .eq("user_id", user.id)
    .gte("planned_date", startDate)
    .lt("planned_date", endDate)
    .order("planned_date");

  // 해당 월의 생성된 글 조회 (캘린더와 연결되지 않은 것도 포함)
  const { data: posts } = await supabase
    .from("generation_queue")
    .select("id, generated_title, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at");

  return NextResponse.json({
    events: events || [],
    posts: posts || [],
  });
}

/**
 * POST /api/calendar
 * Body: { planned_date, topic, category?, memo? }
 * 새 캘린더 이벤트 생성
 */
export async function POST(req: NextRequest) {
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
  const { planned_date, topic, category, memo } = body as {
    planned_date: string;
    topic: string;
    category?: string;
    memo?: string;
  };

  if (!planned_date || !topic?.trim()) {
    return NextResponse.json(
      { error: "날짜와 주제가 필요합니다" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("content_calendar")
    .insert({
      user_id: user.id,
      planned_date,
      topic: topic.trim(),
      category: category || null,
      memo: memo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/calendar
 * Body: { id, topic?, category?, memo?, status?, planned_date? }
 * 캘린더 이벤트 수정
 */
export async function PATCH(req: NextRequest) {
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
  const { id, topic, category, memo, status, planned_date } = body as {
    id: string;
    topic?: string;
    category?: string;
    memo?: string;
    status?: string;
    planned_date?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  // 허용 필드만 화이트리스트로 추출 (user_id 등 변조 방지)
  const VALID_STATUSES = ["planned", "in_progress", "completed", "cancelled"];
  const updates: Record<string, string> = {};
  if (topic !== undefined) updates.topic = topic;
  if (category !== undefined) updates.category = category;
  if (memo !== undefined) updates.memo = memo;
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `유효하지 않은 상태: ${status}. 허용: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updates.status = status;
  }
  if (planned_date !== undefined) updates.planned_date = planned_date;

  const { error } = await supabase
    .from("content_calendar")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/calendar?id=xxx
 * 캘린더 이벤트 삭제
 */
export async function DELETE(req: NextRequest) {
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

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("content_calendar")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
