"use client";

import { useEffect, useState } from "react";

interface PaymentRow {
  id: string;
  portone_payment_id: string;
  amount: number;
  tier: "basic" | "pro" | string;
  status: "paid" | "failed" | "cancelled" | "refunded" | string;
  paid_at: string | null;
  created_at: string;
}

interface PaymentsData {
  subscription: {
    tier: string;
    status: "none" | "active" | "past_due" | "cancelled" | string;
    startedAt: string | null;
    endsAt: string | null;
    nextPaymentAt: string | null;
    hasBillingKey: boolean;
  } | null;
  summary: {
    totalPaid: number;
    totalRefunded: number;
    netPaid: number;
    counts: { paid: number; failed: number; cancelled: number; refunded: number };
  };
  payments: PaymentRow[];
}

const STATUS_LABEL: Record<string, string> = {
  paid: "결제완료",
  failed: "실패",
  cancelled: "취소",
  refunded: "환불",
};

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-orange-100 text-orange-700",
};

const SUB_LABEL: Record<string, string> = {
  none: "구독 없음",
  active: "활성",
  past_due: "연체",
  cancelled: "취소(만료 대기)",
};

const SUB_STYLE: Record<string, string> = {
  none: "bg-gray-100 text-gray-600",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
};

const TIER_LABEL: Record<string, string> = {
  free: "무료",
  basic: "베이직",
  pro: "프로",
};

function formatWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function UserPaymentsTab({ userId }: { userId: string }) {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/users/${userId}/payments`);
        if (!res.ok) {
          setError(`결제 이력 조회 실패 (${res.status})`);
          return;
        }
        const json = (await res.json()) as PaymentsData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("네트워크 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">결제 이력 불러오는 중...</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">데이터 없음</p>;
  }

  const sub = data.subscription;

  return (
    <div className="space-y-4">
      {/* 구독 상태 카드 */}
      {sub && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-medium">구독 상태</h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SUB_STYLE[sub.status] || "bg-gray-100"}`}>
              {SUB_LABEL[sub.status] || sub.status}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
              {TIER_LABEL[sub.tier] || sub.tier}
            </span>
            {sub.hasBillingKey && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                정기결제 등록
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">시작일</p>
              <p className="tabular-nums">{formatDateOnly(sub.startedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">다음 결제일</p>
              <p className="tabular-nums">{formatDateOnly(sub.nextPaymentAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">만료일</p>
              <p className="tabular-nums">{formatDateOnly(sub.endsAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 합계 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">총 결제</p>
          <p className="text-base font-bold tabular-nums">{formatWon(data.summary.totalPaid)}</p>
          <p className="text-xs text-muted-foreground">{data.summary.counts.paid}건</p>
        </div>
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">환불</p>
          <p className="text-base font-bold tabular-nums">{formatWon(data.summary.totalRefunded)}</p>
          <p className="text-xs text-muted-foreground">{data.summary.counts.refunded}건</p>
        </div>
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">순매출</p>
          <p className="text-base font-bold tabular-nums text-emerald-600">
            {formatWon(data.summary.netPaid)}
          </p>
        </div>
        <div className="rounded border p-2.5">
          <p className="text-xs text-muted-foreground">실패/취소</p>
          <p className="text-base font-bold tabular-nums">
            {data.summary.counts.failed + data.summary.counts.cancelled}건
          </p>
        </div>
      </div>

      {/* 결제 이력 테이블 */}
      <div>
        <h4 className="mb-2 text-sm font-medium">결제 이력</h4>
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">결제 이력 없음</p>
        ) : (
          <div className="space-y-1.5">
            {data.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status] || "bg-gray-100"}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                    {TIER_LABEL[p.tier] || p.tier}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(p.paid_at || p.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{formatWon(p.amount)}</span>
                  <span
                    className="font-mono text-[10px] text-muted-foreground"
                    title={p.portone_payment_id}
                  >
                    {p.portone_payment_id.slice(0, 12)}…
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
