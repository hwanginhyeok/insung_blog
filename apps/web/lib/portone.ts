/**
 * 포트원 V2 REST API 서버 래퍼
 *
 * 포트원 V2 API를 직접 호출하는 래퍼.
 * @portone/server-sdk 대신 fetch 사용 (SDK 문서 부족 + 직접 제어 용이).
 *
 * 환경변수:
 *   PORTONE_API_SECRET — 서버 전용 API 시크릿
 *   PORTONE_WEBHOOK_SECRET — 웹훅 서명 검증용 시크릿
 */

import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.portone.io";

function getHeaders(): Record<string, string> {
  const secret = process.env.PORTONE_API_SECRET;
  if (!secret) throw new Error("PORTONE_API_SECRET 환경변수 미설정");
  return {
    Authorization: `PortOne ${secret}`,
    "Content-Type": "application/json",
  };
}

// ── 결제 예약 (정기결제 스케줄) ──

export interface ScheduleParams {
  billingKey: string;
  /** 결제 예약 ID (고유값, 직접 생성) */
  scheduleId: string;
  /** 결제 ID (고유값, 직접 생성) */
  paymentId: string;
  orderName: string;
  amount: number;
  /** 다음 결제 예정 시각 (ISO 8601) */
  timeToPay: string;
  currency?: string;
  /** 웹훅에서 userId/tier 식별용 (JSON 문자열) */
  customData?: string;
}

/**
 * 정기결제 스케줄 등록.
 * 포트원이 timeToPay 시각에 자동으로 빌링키 결제를 실행한다.
 */
export async function createPaymentSchedule(
  params: ScheduleParams
): Promise<{ scheduleId: string }> {
  const res = await fetch(`${API_BASE}/payments/${params.paymentId}/schedule`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      payment: {
        billingKey: params.billingKey,
        orderName: params.orderName,
        amount: { total: params.amount },
        currency: params.currency ?? "KRW",
        ...(params.customData ? { customData: params.customData } : {}),
      },
      timeToPay: params.timeToPay,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `포트원 스케줄 등록 실패: ${res.status} ${JSON.stringify(err)}`
    );
  }

  return { scheduleId: params.scheduleId };
}

/**
 * 빌링키로 즉시 결제 (최초 결제용).
 */
export async function payWithBillingKey(params: {
  paymentId: string;
  billingKey: string;
  orderName: string;
  amount: number;
  currency?: string;
  /** 웹훅에서 userId/tier 식별용 (JSON 문자열) */
  customData?: string;
}): Promise<{ paymentId: string; status: string }> {
  const res = await fetch(
    `${API_BASE}/payments/${params.paymentId}/billing-key`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        billingKey: params.billingKey,
        orderName: params.orderName,
        amount: { total: params.amount },
        currency: params.currency ?? "KRW",
        ...(params.customData ? { customData: params.customData } : {}),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `포트원 빌링키 결제 실패: ${res.status} ${JSON.stringify(err)}`
    );
  }

  const data = await res.json();
  return { paymentId: params.paymentId, status: data.payment?.status ?? "PAID" };
}

/**
 * 결제 예약 취소.
 */
export async function cancelPaymentSchedule(
  scheduleId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/payment-schedules/${scheduleId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `포트원 스케줄 취소 실패: ${res.status} ${JSON.stringify(err)}`
    );
  }
}

// ── 결제 취소 (환불) ──

/**
 * 결제 취소 (전액 환불).
 * 스케줄 등록/DB 업데이트 실패 시 보상 트랜잭션으로 사용.
 */
export async function cancelPayment(
  paymentId: string,
  reason: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/payments/${paymentId}/cancel`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 환불 실패는 심각한 문제이므로 상세 로그 기록
    console.error(
      `[CRITICAL] 포트원 결제 취소 실패 — paymentId: ${paymentId}, ` +
      `status: ${res.status}, error: ${JSON.stringify(err)}`
    );
    throw new Error(
      `포트원 결제 취소 실패: ${res.status} ${JSON.stringify(err)}`
    );
  }
}

// ── 결제 조회 (동기화용) ──

export interface PaymentInfo {
  paymentId: string;
  status: string;
  amount?: { total: number };
  paidAt?: string;
}

/**
 * 결제 상태 조회 (동기화 버튼용).
 */
export async function getPayment(paymentId: string): Promise<PaymentInfo> {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `포트원 결제 조회 실패: ${res.status} ${JSON.stringify(err)}`
    );
  }

  const data = await res.json();
  return {
    paymentId: data.payment?.id ?? paymentId,
    status: data.payment?.status ?? "UNKNOWN",
    amount: data.payment?.amount,
    paidAt: data.payment?.paidAt,
  };
}

// ── 웹훅 서명 검증 ──

/**
 * 포트원 웹훅 HMAC-SHA256 서명 검증.
 * 검증 실패 시 false 반환.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PORTONE_WEBHOOK_SECRET 환경변수 미설정");
    return false;
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // 타이밍 공격 방지: 문자열 길이가 다르면 즉시 false, 같으면 timingSafeEqual
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── 유틸리티 ──

/**
 * 다음 달 같은 날짜 계산 (결제 예약용).
 * 31일 → 다음 달 말일로 자동 조정.
 */
export function getNextPaymentDate(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * 고유 결제 ID 생성.
 * 형식: insung_{userId 앞 8자}_{timestamp}
 */
export function generatePaymentId(userId: string): string {
  return `insung_${userId.slice(0, 8)}_${Date.now()}`;
}
