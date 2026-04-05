import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => mockAdmin,
}));

const mockAdmin = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  lte: vi.fn().mockResolvedValue({ data: [], error: null }),
  update: vi.fn().mockReturnThis(),
  in: vi.fn().mockResolvedValue({ error: null }),
};

const CRON_SECRET = "test-cron-secret";

describe("/api/cron/expire-subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    mockAdmin.from.mockReturnValue(mockAdmin);
    mockAdmin.select.mockReturnValue(mockAdmin);
    mockAdmin.eq.mockReturnValue(mockAdmin);
    mockAdmin.not.mockReturnValue(mockAdmin);
    mockAdmin.update.mockReturnValue(mockAdmin);
  });

  it("CRON_SECRET 미일치 시 401 반환", async () => {
    const { GET } = await import("@/app/api/cron/expire-subscriptions/route");

    const req = new Request("http://localhost/api/cron/expire-subscriptions", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("만료된 구독 없으면 expired: 0 반환", async () => {
    mockAdmin.lte.mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/cron/expire-subscriptions/route");

    const req = new Request("http://localhost/api/cron/expire-subscriptions", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await GET(req as any);
    const json = await res.json();
    expect(json.expired).toBe(0);
  });

  it("만료된 구독 → free 전환 + 필드 초기화", async () => {
    mockAdmin.lte.mockResolvedValue({
      data: [
        { id: "user-1", tier: "basic", subscription_ends_at: "2026-04-04T00:00:00Z" },
        { id: "user-2", tier: "pro", subscription_ends_at: "2026-04-03T00:00:00Z" },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/cron/expire-subscriptions/route");

    const req = new Request("http://localhost/api/cron/expire-subscriptions", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await GET(req as any);
    const json = await res.json();

    expect(json.expired).toBe(2);
    expect(json.userIds).toEqual(["user-1", "user-2"]);

    // tier = free, subscription 초기화
    expect(mockAdmin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "free",
        subscription_status: "none",
        subscription_ends_at: null,
      })
    );
    expect(mockAdmin.in).toHaveBeenCalledWith("id", ["user-1", "user-2"]);
  });
});
