"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TIER_LIMITS, type Tier } from "@/lib/tier";
import { CreditCard, Calendar, RefreshCw, XCircle } from "lucide-react";

interface SubscriptionInfo {
  tier: Tier;
  subscriptionStatus: string;
  nextPaymentAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionStartedAt: string | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  tier: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

/**
 * /billing — 구독 관리 페이지 (Client Component)
 * 현재 플랜, 다음 결제일, 결제 이력, 해지/동기화 버튼.
 */
export default function BillingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 구독 정보
    const { data: userData } = await supabase
      .from("users")
      .select(
        "tier, subscription_status, next_payment_at, subscription_ends_at, subscription_started_at"
      )
      .eq("id", user.id)
      .single();

    if (userData) {
      setInfo({
        tier: (userData.tier ?? "free") as Tier,
        subscriptionStatus: userData.subscription_status ?? "none",
        nextPaymentAt: userData.next_payment_at,
        subscriptionEndsAt: userData.subscription_ends_at,
        subscriptionStartedAt: userData.subscription_started_at,
      });
    }

    // 결제 이력
    const { data: paymentData } = await supabase
      .from("payments")
      .select("id, amount, tier, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (paymentData) setPayments(paymentData);
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("정말 구독을 해지하시겠습니까?\n다음 결제일까지는 현재 플랜이 유지됩니다.")) {
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "해지 실패");
        return;
      }
      await loadData();
    } catch {
      alert("해지 처리 중 오류가 발생했습니다.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const data = await res.json();
      if (data.updated) {
        alert(data.message);
        await loadData();
      } else {
        alert(data.message ?? "이미 최신 상태입니다.");
      }
    } catch {
      alert("동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!info) return null;

  const tierInfo = TIER_LIMITS[info.tier];
  const isActive = info.subscriptionStatus === "active";
  const isCancelled = info.subscriptionStatus === "cancelled";
  const isPastDue = info.subscriptionStatus === "past_due";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">구독 관리</h1>
        <p className="text-sm text-muted-foreground">현재 플랜과 결제 이력을 확인하세요</p>
      </div>

      {/* 현재 플랜 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            현재 플랜
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">{tierInfo.label}</div>
              <div className="text-sm text-muted-foreground">
                {tierInfo.price === 0
                  ? "무료"
                  : `₩${tierInfo.price.toLocaleString()}/월`}
              </div>
            </div>
            <div className="text-right">
              {isActive && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  활성
                </span>
              )}
              {isCancelled && (
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                  해지 예정
                </span>
              )}
              {isPastDue && (
                <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                  결제 실패
                </span>
              )}
            </div>
          </div>

          {/* 날짜 정보 */}
          {info.nextPaymentAt && isActive && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              다음 결제일:{" "}
              {new Date(info.nextPaymentAt).toLocaleDateString("ko-KR")}
            </div>
          )}
          {info.subscriptionEndsAt && isCancelled && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              만료일:{" "}
              {new Date(info.subscriptionEndsAt).toLocaleDateString("ko-KR")}
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-2">
            {info.tier === "free" && (
              <Button onClick={() => router.push("/pricing")}>
                플랜 업그레이드
              </Button>
            )}
            {isActive && (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={cancelling}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {cancelling ? "해지 중..." : "구독 해지"}
              </Button>
            )}
            {(isCancelled || isPastDue) && (
              <Button onClick={() => router.push("/pricing")}>
                다시 구독하기
              </Button>
            )}
            <Button variant="ghost" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "동기화 중..." : "결제 동기화"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 결제 이력 */}
      <Card>
        <CardHeader>
          <CardTitle>결제 이력</CardTitle>
          <CardDescription>최근 10건의 결제 기록</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">결제 이력이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {TIER_LIMITS[p.tier as Tier]?.label ?? p.tier} 플랜
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.paid_at
                        ? new Date(p.paid_at).toLocaleDateString("ko-KR")
                        : new Date(p.created_at).toLocaleDateString("ko-KR")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      ₩{p.amount.toLocaleString()}
                    </div>
                    <div className="text-xs">
                      {p.status === "paid" && (
                        <span className="text-primary">결제 완료</span>
                      )}
                      {p.status === "failed" && (
                        <span className="text-destructive">실패</span>
                      )}
                      {p.status === "refunded" && (
                        <span className="text-yellow-600">환불</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
