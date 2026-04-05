import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase 모킹
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
  payWithBillingKey: vi.fn().mockResolvedValue({ paymentId: "pay_1", status: "PAID" }),
  createPaymentSchedule: vi.fn().mockResolvedValue({ scheduleId: "sched_1" }),
  getNextPaymentDate: vi.fn().mockReturnValue(new Date("2026-05-05T00:00:00Z")),
  generatePaymentId: vi.fn().mockReturnValue("insung_test_123"),
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
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockResolvedValue({ error: null }),
  eq: vi.fn().mockResolvedValue({ error: null }),
};

describe("/api/billing/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmin.from.mockReturnValue(mockAdmin);
    mockAdmin.update.mockReturnValue(mockAdmin);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("인증 실패 시 401 반환", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const { POST } = await import("@/app/api/billing/subscribe/route");

    const req = new Request("http://localhost/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ billingKey: "bk_1", tier: "basic" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("잘못된 tier 입력 시 400 반환", async () => {
    const { POST } = await import("@/app/api/billing/subscribe/route");

    const req = new Request("http://localhost/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ billingKey: "bk_1", tier: "enterprise" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("billingKey 누락 시 400 반환", async () => {
    const { POST } = await import("@/app/api/billing/subscribe/route");

    const req = new Request("http://localhost/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ tier: "basic" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("성공 시 tier 업데이트 + payments 기록 + nextPaymentAt 반환", async () => {
    const { POST } = await import("@/app/api/billing/subscribe/route");

    const req = new Request("http://localhost/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ billingKey: "bk_1", tier: "basic" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.tier).toBe("basic");
    expect(json.nextPaymentAt).toBeDefined();

    // DB 업데이트 확인
    expect(mockAdmin.from).toHaveBeenCalledWith("users");
    expect(mockAdmin.update).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "basic", subscription_status: "active" })
    );

    // payments 기록 확인
    expect(mockAdmin.from).toHaveBeenCalledWith("payments");
    expect(mockAdmin.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "basic", amount: 7900, status: "paid" })
    );
  });

  it("포트원 API 에러 시 500 반환", async () => {
    const portone = await import("@/lib/portone");
    vi.mocked(portone.payWithBillingKey).mockRejectedValue(new Error("포트원 에러"));

    const { POST } = await import("@/app/api/billing/subscribe/route");

    const req = new Request("http://localhost/api/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ billingKey: "bk_1", tier: "pro" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});
