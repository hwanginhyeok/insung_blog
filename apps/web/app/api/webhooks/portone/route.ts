import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/portone";

/**
 * POST /api/webhooks/portone
 *
 * 포트원 웹훅 수신. 인증은 HMAC-SHA256 서명 검증으로 처리.
 * Supabase auth 없이 동작 (middleware에서 제외 필요).
 *
 * 처리하는 이벤트:
 *   - Transaction.Paid: 결제 성공 → payments 기록 + tier 업그레이드
 *   - Transaction.Failed: 결제 실패 → subscription_status = 'past_due'
 *   - BillingKey.Deleted: 빌링키 삭제 → 구독 해지 처리
 */
export async function POST(req: NextRequest) {
  // 1. raw body 읽기 (서명 검증에 필요)
  const rawBody = await req.text();
  const signature = req.headers.get("x-portone-signature") ?? "";

  // 2. HMAC 서명 검증
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("포트원 웹훅 서명 검증 실패");
    return NextResponse.json(
      { error: "서명 검증 실패" },
      { status: 401 }
    );
  }

  // 3. 이벤트 파싱
  let event: {
    type: string;
    data: {
      paymentId?: string;
      transactionId?: string;
      billingKey?: string;
      status?: string;
      amount?: { total: number };
      paidAt?: string;
      customData?: string;
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "Transaction.Paid": {
        const { paymentId, amount, paidAt, customData } = event.data;
        if (!paymentId) break;

        // customData에서 userId + tier 파싱 (subscribe에서 설정)
        let userId: string | undefined;
        let tier: string | undefined;
        if (customData) {
          try {
            const parsed = JSON.parse(customData);
            userId = parsed.userId;
            tier = parsed.tier;
          } catch { /* customData 파싱 실패 무시 */ }
        }

        // 멱등성: ON CONFLICT DO NOTHING
        await admin.from("payments").upsert(
          {
            portone_payment_id: paymentId,
            user_id: userId ?? "00000000-0000-0000-0000-000000000000",
            amount: amount?.total ?? 0,
            tier: tier ?? "basic",
            status: "paid",
            paid_at: paidAt ?? new Date().toISOString(),
          },
          { onConflict: "portone_payment_id", ignoreDuplicates: true }
        );

        // tier 업그레이드 (userId가 있을 때만)
        if (userId && tier) {
          await admin
            .from("users")
            .update({
              tier,
              subscription_status: "active",
            })
            .eq("id", userId);
        }
        break;
      }

      case "Transaction.Failed": {
        const { customData } = event.data;
        if (!customData) break;

        let userId: string | undefined;
        try {
          userId = JSON.parse(customData).userId;
        } catch { break; }

        if (userId) {
          await admin
            .from("users")
            .update({ subscription_status: "past_due" })
            .eq("id", userId)
            .eq("subscription_status", "active");
        }
        break;
      }

      case "BillingKey.Deleted": {
        const { billingKey } = event.data;
        if (!billingKey) break;

        // 빌링키로 사용자 찾아서 구독 해지
        const { data: userData } = await admin
          .from("users")
          .select("id, next_payment_at")
          .eq("portone_billing_key", billingKey)
          .single();

        if (userData) {
          await admin
            .from("users")
            .update({
              subscription_status: "cancelled",
              subscription_ends_at: userData.next_payment_at,
              portone_billing_key: null,
              portone_schedule_id: null,
            })
            .eq("id", userData.id);
        }
        break;
      }

      default:
        // 처리하지 않는 이벤트는 무시
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("포트원 웹훅 처리 오류:", e);
    // 웹훅은 200을 반환해야 재전송 안 함
    return NextResponse.json({ received: true, error: "처리 중 오류" });
  }
}
