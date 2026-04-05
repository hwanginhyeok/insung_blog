import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { notifyAdmin } from "@/lib/telegram";

/** Supabase 서버 클라이언트 생성 (인증 확인용) */
function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

const VALID_TYPES = ["bug", "feature", "question", "other"] as const;

/** 유형 한국어 라벨 */
const TYPE_LABELS: Record<string, string> = {
  bug: "버그",
  feature: "기능요청",
  question: "질문",
  other: "기타",
};

/**
 * POST /api/support — 문의 티켓 생성
 *
 * Body: { type, title, description, pageUrl? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { type, title, description, pageUrl } = body as {
    type: string;
    title: string;
    description: string;
    pageUrl?: string;
  };

  // 유효성 검증
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `유효하지 않은 유형: ${type}` },
      { status: 400 }
    );
  }

  if (!title || title.trim().length < 2) {
    return NextResponse.json(
      { error: "제목을 2자 이상 입력해주세요" },
      { status: 400 }
    );
  }

  if (!description || description.trim().length < 5) {
    return NextResponse.json(
      { error: "설명을 5자 이상 입력해주세요" },
      { status: 400 }
    );
  }

  // 길이 제한 (XSS 방어 + 스토리지 보호)
  const sanitizedTitle = String(title).slice(0, 200);
  const sanitizedDesc = String(description).slice(0, 2000);
  const sanitizedUrl = pageUrl ? String(pageUrl).slice(0, 500) : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .insert({
      user_id: user.id,
      type,
      title: sanitizedTitle,
      description: sanitizedDesc,
      page_url: sanitizedUrl,
      status: "open",
    })
    .select()
    .single();

  if (error) {
    console.error("티켓 생성 실패:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }

  // 관리자에게 텔레그램 알림 (비동기, 실패해도 사용자 응답에 영향 없음)
  const typeLabel = TYPE_LABELS[type] || type;
  const userEmail = user.email || "알 수 없음";
  const telegramMsg =
    `📩 새 문의 [${typeLabel}] ${sanitizedTitle}\n` +
    `${sanitizedDesc.slice(0, 200)}${sanitizedDesc.length > 200 ? "..." : ""}\n` +
    `by ${userEmail}`;

  notifyAdmin(telegramMsg).catch(() => {
    /* 알림 실패는 무시 */
  });

  return NextResponse.json({ ok: true, ticket: data });
}

/**
 * GET /api/support — 내 티켓 목록 조회
 */
export async function GET() {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tickets, error } = await admin
    .from("support_tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("티켓 조회 실패:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  return NextResponse.json({ tickets: tickets || [] });
}
