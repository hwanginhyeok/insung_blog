import { NextRequest, NextResponse } from "next/server";
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

// KST = UTC+9
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC ISO 문자열 → KST Date */
function toKst(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS);
}

/** KST Date → "YYYY-MM-DD" */
function kstDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** KST Date → "YYYY-MM" */
function kstMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

type Category = "generation" | "comment" | "bot" | "incoming";

interface ActivityEvent {
  ts: string;
  category: Category;
}

/**
 * GET /api/admin/users/[userId]/usage
 * 특정 사용자의 활동 통계 (관리자 전용)
 *
 * 응답:
 * - heatmap: 24*7 = 168 버킷 (요일 x 시간), 최근 30일 KST 기준
 * - hourly24: 0-23시 시간대별 카운트, 최근 30일
 * - daily30: 최근 30일 일별 카테고리별 카운트
 * - monthly: 이번 달 / 지난 달 카테고리별 카운트
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const adminId = await verifyAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { userId } = params;

  // 60일 윈도우 — 30일 daily + 이번달/지난달 비교 모두 커버
  const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // 4개 시그널 병렬 조회
  const [genResult, botResult, commentResult, incomingResult] = await Promise.all([
    admin
      .from("generation_queue")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since60),

    admin
      .from("bot_run_log")
      .select("run_at")
      .eq("user_id", userId)
      .gte("run_at", since60),

    admin
      .from("pending_comments")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since60),

    admin
      .from("incoming_comments")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since60),
  ]);

  // 통합 이벤트 리스트 만들기
  const events: ActivityEvent[] = [];
  for (const r of genResult.data || []) {
    if (r.created_at) events.push({ ts: r.created_at, category: "generation" });
  }
  for (const r of botResult.data || []) {
    if (r.run_at) events.push({ ts: r.run_at, category: "bot" });
  }
  for (const r of commentResult.data || []) {
    if (r.created_at) events.push({ ts: r.created_at, category: "comment" });
  }
  for (const r of incomingResult.data || []) {
    if (r.created_at) events.push({ ts: r.created_at, category: "incoming" });
  }

  // KST 기준 윈도우 계산
  const nowKst = toKst(new Date().toISOString());
  const todayKstKey = kstDateKey(nowKst);
  const thisMonthKey = kstMonthKey(nowKst);

  // 지난 달 키 = 이번달 1일에서 하루 빼기 (KST)
  const firstOfThisMonth = new Date(nowKst);
  firstOfThisMonth.setUTCDate(1);
  firstOfThisMonth.setUTCHours(0, 0, 0, 0);
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const lastMonthKey = kstMonthKey(lastOfPrevMonth);

  // 최근 30일 일별 키 미리 생성 (오늘 포함, 역순 → 정렬)
  const daily30Keys: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(nowKst);
    d.setUTCDate(d.getUTCDate() - i);
    daily30Keys.push(kstDateKey(d));
  }

  // 집계 버킷 초기화
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const hourly24: number[] = Array(24).fill(0);
  const daily30Map: Record<string, { generation: number; comment: number; bot: number; incoming: number; total: number }> = {};
  for (const key of daily30Keys) {
    daily30Map[key] = { generation: 0, comment: 0, bot: 0, incoming: 0, total: 0 };
  }

  const monthly: Record<string, { generation: number; comment: number; bot: number; incoming: number; total: number }> = {
    [thisMonthKey]: { generation: 0, comment: 0, bot: 0, incoming: 0, total: 0 },
    [lastMonthKey]: { generation: 0, comment: 0, bot: 0, incoming: 0, total: 0 },
  };

  // 마지막 활동
  let lastActivityAt: string | null = null;

  // 30일 컷오프 (KST)
  const thirtyDaysAgoKey = daily30Keys[0];

  for (const ev of events) {
    const kst = toKst(ev.ts);
    const dateKey = kstDateKey(kst);
    const monthKey = kstMonthKey(kst);
    const dayOfWeek = kst.getUTCDay(); // 0=일, 1=월, ..., 6=토
    const hour = kst.getUTCHours();

    // 마지막 활동 갱신 (최신만)
    if (!lastActivityAt || ev.ts > lastActivityAt) {
      lastActivityAt = ev.ts;
    }

    // 30일 윈도우 내일 때만 heatmap/hourly/daily 업데이트
    if (dateKey >= thirtyDaysAgoKey && dateKey <= todayKstKey) {
      heatmap[dayOfWeek][hour]++;
      hourly24[hour]++;
      const bucket = daily30Map[dateKey];
      if (bucket) {
        bucket[ev.category]++;
        bucket.total++;
      }
    }

    // 월별 (이번달/지난달만)
    if (monthly[monthKey]) {
      monthly[monthKey][ev.category]++;
      monthly[monthKey].total++;
    }
  }

  // daily30 배열로 변환 (정렬 보장)
  const daily30 = daily30Keys.map((date) => ({
    date,
    ...daily30Map[date],
  }));

  // heatmap을 평탄한 배열로 (프론트가 다루기 쉽게)
  const heatmapFlat: { day: number; hour: number; count: number }[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      heatmapFlat.push({ day: d, hour: h, count: heatmap[d][h] });
    }
  }

  // hourly24 배열로
  const hourly24Arr = hourly24.map((count, hour) => ({ hour, count }));

  // 30일 합계
  const total30 = daily30.reduce(
    (acc, d) => ({
      generation: acc.generation + d.generation,
      comment: acc.comment + d.comment,
      bot: acc.bot + d.bot,
      incoming: acc.incoming + d.incoming,
      total: acc.total + d.total,
    }),
    { generation: 0, comment: 0, bot: 0, incoming: 0, total: 0 }
  );

  return NextResponse.json({
    summary: {
      lastActivityAt,
      total30,
    },
    heatmap: heatmapFlat,
    hourly24: hourly24Arr,
    daily30,
    monthly: {
      thisMonth: { key: thisMonthKey, ...monthly[thisMonthKey] },
      lastMonth: { key: lastMonthKey, ...monthly[lastMonthKey] },
    },
  });
}
