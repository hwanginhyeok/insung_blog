import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TIER_LIMITS, type Tier } from "@/lib/tier";
import { CheckoutButton } from "@/components/checkout-button";
import { Check, X } from "lucide-react";

const FEATURES: Record<Tier, string[]> = {
  free: [
    "AI 글 생성 월 5회",
    "댓글 봇 일 10개",
    "이웃 관리",
  ],
  basic: [
    "AI 글 생성 월 30회",
    "댓글 봇 일 30개",
    "이웃 관리",
    "이메일 지원",
  ],
  pro: [
    "AI 글 생성 무제한",
    "댓글 봇 일 100개",
    "이웃 관리",
    "우선 지원",
    "고급 분석",
  ],
};

/** 플랜별 기능 비교표 데이터 */
const COMPARISON_ROWS: {
  label: string;
  free: string;
  basic: string;
  pro: string;
}[] = [
  { label: "AI 글쓰기", free: "5회/월", basic: "30회/월", pro: "무제한" },
  { label: "댓글/일", free: "10개", basic: "50개", pro: "1,000개" },
  { label: "블로거/일", free: "3명", basic: "15명", pro: "1,000명" },
  { label: "대댓글/일", free: "5개", basic: "30개", pro: "500개" },
  { label: "이웃봇", free: "no", basic: "yes", pro: "yes" },
  { label: "페르소나 분석", free: "yes", basic: "yes", pro: "yes" },
  { label: "우선 지원", free: "no", basic: "no", pro: "yes" },
];

/**
 * /pricing — 가격 페이지 (Server Component)
 * 현재 사용자 tier를 표시하고, 업그레이드 버튼은 CheckoutButton (Client Component).
 */
export default async function PricingPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/pricing");

  // 현재 tier 조회
  const { data: userData } = await supabase
    .from("users")
    .select("tier, subscription_status")
    .eq("id", user.id)
    .single();

  const currentTier = (userData?.tier ?? "free") as Tier;
  const subscriptionStatus = userData?.subscription_status ?? "none";

  const tiers: Tier[] = ["free", "basic", "pro"];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">요금제</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          네이버 블로그 운영을 자동화하세요
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => {
          const info = TIER_LIMITS[tier];
          const isCurrent = tier === currentTier;
          const isPopular = tier === "basic";

          return (
            <Card
              key={tier}
              className={
                isPopular
                  ? "border-primary shadow-lg relative"
                  : "relative"
              }
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  인기
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-lg">{info.label}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {info.price === 0
                      ? "무료"
                      : `₩${info.price.toLocaleString()}`}
                  </span>
                  {info.price > 0 && (
                    <span className="text-sm text-muted-foreground">
                      /월
                    </span>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-2">
                  {FEATURES[tier].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                {isCurrent ? (
                  <div className="w-full rounded-md bg-muted py-2 text-center text-sm font-medium text-muted-foreground">
                    {subscriptionStatus === "active"
                      ? "현재 플랜"
                      : subscriptionStatus === "cancelled"
                        ? "해지 예정"
                        : "현재 플랜"}
                  </div>
                ) : tier === "free" ? (
                  <div className="w-full rounded-md bg-muted py-2 text-center text-sm text-muted-foreground">
                    기본 플랜
                  </div>
                ) : (
                  <CheckoutButton tier={tier} currentTier={currentTier} />
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* 플랜 비교표 */}
      <div className="overflow-x-auto">
        <h2 className="mb-4 text-center text-lg font-semibold">플랜 비교</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-3 pr-4 text-left font-medium text-muted-foreground">기능</th>
              {(["free", "basic", "pro"] as Tier[]).map((tier) => (
                <th key={tier} className="px-4 py-3 text-center font-medium">
                  {TIER_LIMITS[tier].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{row.label}</td>
                {(["free", "basic", "pro"] as Tier[]).map((tier) => {
                  const val = row[tier];
                  return (
                    <td key={tier} className="px-4 py-3 text-center">
                      {val === "yes" ? (
                        <Check className="mx-auto h-4 w-4 text-primary" />
                      ) : val === "no" ? (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                      ) : (
                        <span>{val}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        모든 플랜은 카카오페이로 결제됩니다. 언제든 해지할 수 있습니다.
      </p>
    </div>
  );
}
