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
import { Check } from "lucide-react";

const FEATURES: Record<Tier, string[]> = {
  free: [
    "AI 글 생성 월 10회",
    "댓글 봇 일 30회",
    "이웃 관리",
  ],
  basic: [
    "AI 글 생성 월 50회",
    "댓글 봇 일 30회",
    "이웃 관리",
    "이메일 지원",
  ],
  pro: [
    "AI 글 생성 월 200회",
    "댓글 봇 일 30회",
    "이웃 관리",
    "우선 지원",
    "고급 분석",
  ],
};

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

      <p className="text-center text-xs text-muted-foreground">
        모든 플랜은 카카오페이로 결제됩니다. 언제든 해지할 수 있습니다.
      </p>
    </div>
  );
}
