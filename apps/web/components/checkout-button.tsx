"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TIER_LIMITS, type Tier } from "@/lib/tier";

interface CheckoutButtonProps {
  tier: Tier;
  currentTier: Tier;
}

/**
 * 결제 버튼 (Client Component).
 * 포트원 @portone/browser-sdk로 빌링키 발급 → /api/billing/subscribe 호출.
 */
export function CheckoutButton({ tier, currentTier }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const tierInfo = TIER_LIMITS[tier];

  const handleCheckout = async () => {
    setLoading(true);

    try {
      // 1. 포트원 SDK 동적 import (브라우저에서만 로드)
      const PortOne = await import("@portone/browser-sdk/v2");

      // 2. 빌링키 발급 요청
      const response = await PortOne.requestIssueBillingKey({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        billingKeyMethod: "EASY_PAY",
        issueId: `billing_${Date.now()}`,
        issueName: `인성이블로그 ${tierInfo.label} 플랜`,
      });

      if (response?.code) {
        // 결제 실패 또는 취소
        if (response.code === "FAILURE_TYPE_PG") {
          alert("결제가 실패했습니다. 다시 시도해주세요.");
        }
        // 사용자 취소는 조용히 처리
        return;
      }

      if (!response?.billingKey) {
        alert("빌링키 발급에 실패했습니다.");
        return;
      }

      // 3. 서버에 구독 등록 요청
      const subscribeRes = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingKey: response.billingKey,
          tier,
        }),
      });

      const subscribeData = await subscribeRes.json();

      if (!subscribeRes.ok) {
        alert(subscribeData.error ?? "구독 등록에 실패했습니다.");
        return;
      }

      // 4. 성공 → billing 페이지로 이동
      router.push("/billing");
      router.refresh();
    } catch (e) {
      console.error("결제 오류:", e);
      alert("결제 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isUpgrade = TIER_LIMITS[tier].price > TIER_LIMITS[currentTier].price;

  return (
    <Button
      className="w-full"
      variant={isUpgrade ? "default" : "outline"}
      onClick={handleCheckout}
      disabled={loading}
    >
      {loading
        ? "결제 진행 중..."
        : isUpgrade
          ? `${tierInfo.label} 시작하기`
          : `${tierInfo.label}로 변경`}
    </Button>
  );
}
