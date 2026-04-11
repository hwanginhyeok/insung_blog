import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

async function verifyAdmin() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin" ? user.id : null;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKst(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS);
}

function kstDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/admin/stats/activity
 * 시스템 전체 일별 활동 (관리자 전용)
 *
 * 최근 30일 KST 기준:
 * - 활성 유저 수 (그날 1건이라도 기록 있는 유니크 user_id)
 * - 글 생성 수
 * - 댓글 생성 수
 * - 봇 실행 수
 */
export async function GET() {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const admin = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [genResult, botResult, commentResult] = await Promise.all([
    admin.from("generation_queue").select("created_at, user_id").gte("created_at", since30),
    admin.from("bot_run_log").select("run_at, user_id").gte("run_at", since30),
    admin.from("pending_comments").select("created_at, user_id").gte("created_at", since30),
  ]);

  // 30일 키 미리 생성
  const nowKst = toKst(new Date().toISOString());
  const dailyKeys: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(nowKst);
    d.setUTCDate(d.getUTCDate() - i);
    dailyKeys.push(kstDateKey(d));
  }

  // 일별 집계 + 유니크 유저 추적
  const dailyMap: Record<
    string,
    { generation: number; comment: number; bot: number; total: number; userSet: Set<string> }
  > = {};
  for (const key of dailyKeys) {
    dailyMap[key] = { generation: 0, comment: 0, bot: 0, total: 0, userSet: new Set() };
  }

  function record(ts: string | null, userId: string | null, kind: "generation" | "comment" | "bot") {
    if (!ts) return;
    const dateKey = kstDateKey(toKst(ts));
    const bucket = dailyMap[dateKey];
    if (!bucket) return;
    bucket[kind]++;
    bucket.total++;
    if (userId) bucket.userSet.add(userId);
  }

  for (const r of genResult.data || []) record(r.created_at, r.user_id, "generation");
  for (const r of botResult.data || []) record(r.run_at, r.user_id, "bot");
  for (const r of commentResult.data || []) record(r.created_at, r.user_id, "comment");

  const daily30 = dailyKeys.map((date) => {
    const b = dailyMap[date];
    return {
      date,
      generation: b.generation,
      comment: b.comment,
      bot: b.bot,
      total: b.total,
      activeUsers: b.userSet.size,
    };
  });

  // 전체 30일 합
  const total30 = daily30.reduce(
    (acc, d) => ({
      generation: acc.generation + d.generation,
      comment: acc.comment + d.comment,
      bot: acc.bot + d.bot,
      total: acc.total + d.total,
    }),
    { generation: 0, comment: 0, bot: 0, total: 0 }
  );

  // 전체 30일 유니크 유저
  const allUsers = new Set<string>();
  for (const b of Object.values(dailyMap)) {
    b.userSet.forEach((u) => allUsers.add(u));
  }

  return NextResponse.json({
    summary: {
      ...total30,
      uniqueActiveUsers30: allUsers.size,
    },
    daily30,
  });
}
