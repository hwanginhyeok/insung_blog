import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// 모킹
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => mockAdmin,
}));

const mockAdmin = {
  from: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockResolvedValue({ error: null }),
  update: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: "user-1", next_payment_at: "2026-05-05T00:00:00Z" } }),
};

// 포트원 웹훅 시크릿
const WEBHOOK_SECRET = "test-webhook-secret";

function makeSignature(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

describe("/api/webhooks/portone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PORTONE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    // from() 체이닝 리셋
    mockAdmin.from.mockReturnValue(mockAdmin);
    mockAdmin.update.mockReturnValue(mockAdmin);
    mockAdmin.select.mockReturnValue(mockAdmin);
    mockAdmin.eq.mockReturnValue(mockAdmin);
  });

  it("서명 검증 실패 시 401 반환", async () => {
    const { POST } = await import("@/app/api/webhooks/portone/route");
    const body = JSON.stringify({ type: "Transaction.Paid", data: {} });

    const req = new Request("http://localhost/api/webhooks/portone", {
      method: "POST",
      body,
      headers: { "x-portone-signature": "invalid-signature" },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("유효한 서명 + Transaction.Paid → payments upsert + tier 업데이트", async () => {
    const { POST } = await import("@/app/api/webhooks/portone/route");
    const event = {
      type: "Transaction.Paid",
      data: {
        paymentId: "pay_123",
        amount: { total: 7900 },
        paidAt: "2026-04-05T10:00:00Z",
        customData: JSON.stringify({ userId: "user-1", tier: "basic" }),
      },
    };
    const body = JSON.stringify(event);
    const signature = makeSignature(body);

    const req = new Request("http://localhost/api/webhooks/portone", {
      method: "POST",
      body,
      headers: { "x-portone-signature": signature },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.received).toBe(true);

    // payments upsert 호출 확인
    expect(mockAdmin.from).toHaveBeenCalledWith("payments");
    expect(mockAdmin.upsert).toHaveBeenCalled();

    // tier 업데이트 확인
    expect(mockAdmin.from).toHaveBeenCalledWith("users");
    expect(mockAdmin.update).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "basic", subscription_status: "active" })
    );
  });

  it("중복 웹훅은 멱등하게 처리 (ON CONFLICT DO NOTHING)", async () => {
    const { POST } = await import("@/app/api/webhooks/portone/route");
    const event = {
      type: "Transaction.Paid",
      data: {
        paymentId: "pay_duplicate",
        amount: { total: 7900 },
        customData: JSON.stringify({ userId: "user-1", tier: "basic" }),
      },
    };
    const body = JSON.stringify(event);
    const signature = makeSignature(body);

    const req = new Request("http://localhost/api/webhooks/portone", {
      method: "POST",
      body,
      headers: { "x-portone-signature": signature },
    });

    // 첫 번째 호출
    await POST(req.clone() as any);
    // 두 번째 호출 (중복)
    const res = await POST(new Request("http://localhost/api/webhooks/portone", {
      method: "POST",
      body,
      headers: { "x-portone-signature": signature },
    }) as any);

    expect(res.status).toBe(200);
    // upsert with ignoreDuplicates 사용 확인
    expect(mockAdmin.upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ignoreDuplicates: true })
    );
  });

  it("Transaction.Failed → subscription_status = past_due", async () => {
    const { POST } = await import("@/app/api/webhooks/portone/route");
    const event = {
      type: "Transaction.Failed",
      data: {
        customData: JSON.stringify({ userId: "user-1" }),
      },
    };
    const body = JSON.stringify(event);
    const signature = makeSignature(body);

    const req = new Request("http://localhost/api/webhooks/portone", {
      method: "POST",
      body,
      headers: { "x-portone-signature": signature },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    expect(mockAdmin.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "past_due" })
    );
  });

  it("BillingKey.Deleted → 구독 해지 처리", async () => {
    const { POST } = await import("@/app/api/webhooks/portone/route");
    const event = {
      type: "BillingKey.Deleted",
      data: { billingKey: "bk_123" },
    };
    const body = JSON.stringify(event);
    const signature = makeSignature(body);

    const req = new Request("http://localhost/api/webhooks/portone", {
      method: "POST",
      body,
      headers: { "x-portone-signature": signature },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    expect(mockAdmin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: "cancelled",
        portone_billing_key: null,
      })
    );
  });
});
