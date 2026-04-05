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
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

describe("/api/billing/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmin.from.mockReturnValue(mockAdmin);
    mockAdmin.select.mockReturnValue(mockAdmin);
    mockAdmin.eq.mockReturnValue(mockAdmin);
    mockAdmin.order.mockReturnValue(mockAdmin);
    mockAdmin.limit.mockReturnValue(mockAdmin);
    mockAdmin.update.mockReturnValue(mockAdmin);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("결제 이력 없으면 synced: true, 업데이트 없음", async () => {
    mockAdmin.single
      .mockResolvedValueOnce({ data: null }) // payments 조회
      .mockResolvedValueOnce({ data: { tier: "free" } }); // users 조회

    const { POST } = await import("@/app/api/billing/sync/route");

    const req = new Request("http://localhost/api/billing/sync", {
      method: "POST",
    });

    const res = await POST(req as any);
    const json = await res.json();
    expect(json.synced).toBe(true);
    expect(json.message).toContain("결제 이력이 없습니다");
  });

  it("tier 불일치 시 동기화 + updated: true", async () => {
    mockAdmin.single
      .mockResolvedValueOnce({ data: { tier: "basic", status: "paid", paid_at: "2026-04-05" } })
      .mockResolvedValueOnce({ data: { tier: "free", subscription_status: "none" } });

    const { POST } = await import("@/app/api/billing/sync/route");

    const req = new Request("http://localhost/api/billing/sync", {
      method: "POST",
    });

    const res = await POST(req as any);
    const json = await res.json();
    expect(json.synced).toBe(true);
    expect(json.updated).toBe(true);
    expect(json.tier).toBe("basic");
  });

  it("이미 최신 상태면 updated: false", async () => {
    mockAdmin.single
      .mockResolvedValueOnce({ data: { tier: "basic", status: "paid" } })
      .mockResolvedValueOnce({ data: { tier: "basic", subscription_status: "active" } });

    const { POST } = await import("@/app/api/billing/sync/route");

    const req = new Request("http://localhost/api/billing/sync", {
      method: "POST",
    });

    const res = await POST(req as any);
    const json = await res.json();
    expect(json.synced).toBe(true);
    expect(json.updated).toBe(false);
  });
});
