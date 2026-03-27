import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 랜딩 페이지 — AI 블로그 글쓰기 파트너
 *
 * 핵심 메시지: "당신의 블로그, AI가 함께 씁니다"
 * CTA: 무료로 시작하기 → /login
 * 구조: 히어로 → 3가지 핵심 가치 → CTA
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-stone-50">
      {/* 히어로 섹션 */}
      <section className="max-w-4xl mx-auto px-4 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
          당신의 블로그,
          <br />
          <span className="text-emerald-600">AI가 함께 씁니다</span>
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
          사진과 메모만 올리면 당신만의 스타일로 블로그 글을 작성해드려요.
          <br />
          체험단 리뷰, 일상 기록, 맛집 후기까지.
          <br />
          경험에 집중하세요. 글은 AI가 쓸게요.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login">
            <Button size="lg" className="text-base px-8 bg-emerald-600 hover:bg-emerald-700">
              무료로 시작하기
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-sm text-gray-400">
          월 10회 무료 · 신용카드 불필요
        </p>
      </section>

      {/* 핵심 가치 3가지 */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon="✍️"
            title="AI 글쓰기"
            description="사진을 올리면 당신의 스타일을 학습한 AI가 블로그 글을 작성합니다. 체험단 리뷰도, 일상 기록도."
          />
          <FeatureCard
            icon="🤖"
            title="댓글봇"
            description="이웃 블로그에 자연스러운 AI 댓글을 달아드려요. 승인 후 게시되니 안심하세요."
            badge="보너스"
          />
          <FeatureCard
            icon="🤝"
            title="이웃 관리"
            description="서로이웃 신청, 교류 추적, 테마별 추천까지. 블로그 네트워크를 자동으로 관리합니다."
            badge="보너스"
          />
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          매일 1-2시간, 더 가치있게 쓰세요
        </h2>
        <p className="mt-4 text-gray-600">
          블로그 운영에 쏟는 시간을 줄이고, 실제 경험과 기록에 집중하세요.
        </p>
        <div className="mt-6">
          <Link href="/login">
            <Button size="lg" className="text-base px-8 bg-emerald-600 hover:bg-emerald-700">
              무료로 시작하기
            </Button>
          </Link>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t py-8 text-center text-sm text-gray-400">
        <p>인성이 AI 블로그 파트너</p>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-3xl">{icon}</span>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {badge && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
