import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createServerClient: () => mockSupabase,
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: () => [] }),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => mockAdmin,
}));
vi.mock("@/lib/portone", () => ({
  cancelPaymentSchedule: vi.fn().mockResolvedValue(undefined),
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    }),
  },
};

const mockAdmin = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn(),
};

describe("/api/billing/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmin.from.mockReturnValue(mockAdmin);
    mockAdmin.select.mockReturnValue(mockAdmin);
    mockAdmin.update.mockReturnValue(mockAdmin);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("구독 없는 사용자 해지 시도 → 400", async () => {
    mockAdmin.eq.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { subscription_status: "none", portone_schedule_id: null, next_payment_at: null },
      }),
    });

    const { POST } = await import("@/app/api/billing/cancel/route");

    const req = new Request("http://localhost/api/billing/cancel", {
      method: "POST",
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("활성 구독 해지 → subscription_ends_at 설정 + 스케줄 삭제", async () => {
    // 첫 번째 eq (select용): single 반환
    // 두 번째 eq (update용): { error: null } 반환
    let callCount = 0;
    mockAdmin.eq.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return {
          single: vi.fn().mockResolvedValue({
            data: {
              subscription_status: "active",
              portone_schedule_id: "sched_1",
              next_payment_at: "2026-05-05T00:00:00Z",
            },
          }),
          eq: mockAdmin.eq,
        };
      }
      return { error: null };
    });

    const { POST } = await import("@/app/api/billing/cancel/route");
    const portone = await import("@/lib/portone");

    const req = new Request("http://localhost/api/billing/cancel", {
      method: "POST",
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.subscriptionEndsAt).toBe("2026-05-05T00:00:00Z");

    // 포트원 스케줄 삭제 확인
    expect(portone.cancelPaymentSchedule).toHaveBeenCalledWith("sched_1");
  });
});
