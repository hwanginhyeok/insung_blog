"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Crown, BarChart3, Globe, KeyRound } from "lucide-react";

interface ProfileData {
  email: string;
  tier: string;
  monthlyGenCount: number;
  genCountResetMonth: string | null;
  naverBlogId: string | null;
}

/** 티어 표시 라벨 */
const TIER_LABELS: Record<string, string> = {
  free: "무료",
  basic: "베이직",
  pro: "프로",
};

/** 티어별 월간 AI 생성 한도 (클라이언트 표시용) */
const TIER_MAX: Record<string, number> = {
  free: 5,
  basic: 30,
  pro: 9999,
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 사용자 프로필 + 봇 설정에서 네이버 블로그 ID 조회
      const { data: userData } = await supabase
        .from("users")
        .select("tier, monthly_gen_count, gen_count_reset_month")
        .eq("id", user.id)
        .single();

      const { data: botData } = await supabase
        .from("bot_settings")
        .select("naver_blog_id")
        .eq("user_id", user.id)
        .single();

      const currentMonth = new Date().toISOString().slice(0, 7);
      const usedCount =
        userData?.gen_count_reset_month === currentMonth
          ? userData?.monthly_gen_count ?? 0
          : 0;

      setProfile({
        email: user.email ?? "",
        tier: userData?.tier ?? "free",
        monthlyGenCount: usedCount,
        genCountResetMonth: userData?.gen_count_reset_month ?? null,
        naverBlogId: botData?.naver_blog_id ?? null,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">로그인이 필요합니다</p>
      </div>
    );
  }

  const tier = profile.tier as "free" | "basic" | "pro";
  const max = TIER_MAX[tier] ?? 5;
  const usagePercent = max === 9999 ? 0 : Math.round((profile.monthlyGenCount / max) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 프로필</h1>
        <p className="text-sm text-muted-foreground">계정 정보와 사용 현황</p>
      </div>

      {/* 계정 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            계정 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">이메일</span>
            <span className="text-sm font-medium">{profile.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">비밀번호</span>
            <Link href="/reset-password">
              <Button variant="outline" size="sm">
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                비밀번호 변경
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 현재 플랜 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4" />
            현재 플랜
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{TIER_LABELS[tier] ?? tier}</span>
            {tier === "free" && (
              <Link href="/pricing">
                <Button size="sm">업그레이드</Button>
              </Link>
            )}
            {tier !== "free" && (
              <Link href="/billing">
                <Button variant="outline" size="sm">
                  구독 관리
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 사용량 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            이번 달 사용량
          </CardTitle>
          <CardDescription>월간 AI 글 생성 횟수</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold">{profile.monthlyGenCount}</span>
            <span className="text-sm text-muted-foreground">
              / {max === 9999 ? "무제한" : `${max}회`}
            </span>
          </div>
          {max !== 9999 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 연결된 블로그 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            연결된 네이버 블로그
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.naverBlogId ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{profile.naverBlogId}</p>
                <a
                  href={`https://blog.naver.com/${profile.naverBlogId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  blog.naver.com/{profile.naverBlogId}
                </a>
              </div>
              <Link href="/bot">
                <Button variant="outline" size="sm">
                  설정 변경
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                아직 연결된 블로그가 없습니다
              </p>
              <Link href="/bot">
                <Button variant="outline" size="sm">
                  블로그 연결
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
