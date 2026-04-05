/**
 * 구독 티어 정의 + 월간 사용량 관리 (서버 전용)
 *
 * 티어별 월간 AI 생성 한도:
 *   free  (무료)   → 5회/월
 *   basic (베이직) → 30회/월
 *   pro   (프로)   → 무제한 (9999)
 *
 * 사용량 흐름 (원자적):
 *   1. reserveUsage() — DB 함수로 체크 + 증분을 원자적 실행 (FOR UPDATE 행 잠금)
 *   2. (AI 호출)
 *   3. AI 실패 시 rollbackUsage() — 카운트 -1 원복
 *
 * 월 전환 시 자동 리셋:
 *   gen_count_reset_month가 현재 YYYY-MM과 다르면 카운트를 0으로 리셋.
 *   별도 cron job 불필요.
 */

import { createAdminClient } from "@/lib/supabase-admin";

// ── 타입 + 상수 ──

export type Tier = "free" | "basic" | "pro";

export const TIER_LIMITS: Record<
  Tier,
  {
    label: string;
    max: number;          // AI 글쓰기 월 한도
    price: number;
    commentsPerDay: number;   // 댓글/일
    bloggersPerDay: number;   // 블로거/일
    repliesPerDay: number;    // 대댓글/일
    neighborBot: boolean;     // 이웃봇 사용 가능
  }
> = {
  free:  { label: "무료",   max: 5,    price: 0,     commentsPerDay: 10,  bloggersPerDay: 3,  repliesPerDay: 5,  neighborBot: false },
  basic: { label: "베이직", max: 30,   price: 7900,  commentsPerDay: 30,  bloggersPerDay: 10, repliesPerDay: 20, neighborBot: true },
  pro:   { label: "프로",   max: 9999, price: 14900, commentsPerDay: 100, bloggersPerDay: 30, repliesPerDay: 50, neighborBot: true },
};

export interface UsageResult {
  allowed: boolean;
  tier: Tier;
  used: number;
  limit: number;
  remaining: number;
}

// ── 사용량 조회 (읽기 전용, UI 표시용) ──

/**
 * 사용자의 현재 월 사용량 확인 (UI 표시용, 읽기 전용).
 * 실제 한도 체크는 reserveUsage()로 해야 한다.
 */
export async function checkUsage(userId: string): Promise<UsageResult> {
  const admin = createAdminClient();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: user } = await admin
    .from("users")
    .select("tier, monthly_gen_count, gen_count_reset_month")
    .eq("id", userId)
    .single();

  if (!user) {
    return { allowed: false, tier: "free", used: 0, limit: 0, remaining: 0 };
  }

  const tier = (user.tier || "free") as Tier;
  const limit = TIER_LIMITS[tier].max;

  const used =
    user.gen_count_reset_month === currentMonth
      ? user.monthly_gen_count || 0
      : 0;

  return {
    allowed: used < limit,
    tier,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

// ── 원자적 예약 (체크 + 증분 동시 실행) ──

/**
 * DB 함수(reserve_generation)로 한도 체크 + 카운트 증분을 원자적 실행.
 * FOR UPDATE 행 잠금으로 동시 요청 시에도 레이스 컨디션 없음.
 *
 * AI 호출 전에 호출. 실패 시 rollbackUsage()로 원복.
 */
export async function reserveUsage(userId: string): Promise<UsageResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("reserve_generation", {
    p_user_id: userId,
  });

  if (error) {
    console.error("reserveUsage RPC 오류:", error);
    return { allowed: false, tier: "free", used: 0, limit: 0, remaining: 0 };
  }

  const result = data as {
    allowed: boolean;
    tier: string;
    used: number;
    limit: number;
    remaining: number;
  };

  return {
    allowed: result.allowed,
    tier: (result.tier || "free") as Tier,
    used: result.used,
    limit: result.limit,
    remaining: result.remaining,
  };
}

/**
 * AI 호출 실패 시 카운트 -1 원복.
 * reserveUsage()에서 증분한 것을 되돌린다.
 */
export async function rollbackUsage(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.rpc("rollback_generation", {
    p_user_id: userId,
  });

  if (error) {
    console.error("rollbackUsage RPC 오류:", error);
  }
}
