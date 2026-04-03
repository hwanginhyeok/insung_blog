import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* 히어로 — 풀 블리드, 비대칭 레이아웃 */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="md:grid md:grid-cols-5 md:gap-16 md:items-center">
          {/* 텍스트 — 좌측 정렬 (3/5) */}
          <div className="md:col-span-3">
            <p className="text-sm font-medium text-emerald-600 tracking-wide uppercase">
              AI 블로그 파트너
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-[1.15]">
              경험에 집중하세요.
              <br />
              글은 AI가 쓸게요.
            </h1>
            <p className="mt-5 text-lg text-gray-500 max-w-lg leading-relaxed">
              사진과 메모만 올리면 당신만의 스타일로 블로그 글을 완성합니다.
              체험단 리뷰, 맛집 후기, 일상 기록까지.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link href="/login?mode=signup">
                <Button size="lg" className="text-base px-8 bg-emerald-600 hover:bg-emerald-700">
                  무료로 시작하기
                </Button>
              </Link>
              <span className="text-sm text-gray-400">월 10회 무료</span>
            </div>
            {/* 모바일 — 인라인 스탯 배지 */}
            <div className="mt-6 flex flex-wrap gap-2 md:hidden">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">1분 완성</span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">일 30개 댓글</span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">24/7 이웃관리</span>
            </div>
          </div>

          {/* 데스크톱 — 요약 스탯 카드 (2/5) */}
          <div className="hidden md:block md:col-span-2">
            <div className="bg-gray-50 rounded-2xl p-8 space-y-6">
              <StatItem number="1분" label="글 하나 완성까지" />
              <StatItem number="30개" label="일일 자동 댓글" />
              <StatItem number="24/7" label="이웃 관리 자동화" />
            </div>
          </div>
        </div>
      </section>

      {/* 기능 섹션 — 2컬럼 비대칭 */}
      <section className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-900">
            블로그 운영, 이렇게 바뀝니다
          </h2>

          <div className="mt-12 space-y-16">
            {/* 기능 1 — AI 글쓰기 (메인) */}
            <div className="md:grid md:grid-cols-2 md:gap-12 md:items-start">
              <div>
                <span className="text-sm font-medium text-emerald-600">핵심 기능</span>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">
                  AI가 당신의 말투를 학습합니다
                </h3>
                <p className="mt-3 text-gray-500 leading-relaxed">
                  페르소나 분석으로 당신만의 글쓰기 스타일을 파악하고,
                  사진에서 감정과 분위기를 읽어 자연스러운 글을 작성합니다.
                  복사해서 바로 네이버에 발행하세요.
                </p>
              </div>
              <div className="mt-6 md:mt-0 bg-gray-50 rounded-xl p-6">
                <div className="text-sm text-gray-400 mb-2">작동 방식</div>
                <div className="space-y-3 text-sm">
                  <Step n="1" text="사진 + 메모 업로드" />
                  <Step n="2" text="AI가 당신 스타일로 글 작성" />
                  <Step n="3" text="HTML 복사 → 네이버 발행" />
                </div>
              </div>
            </div>

            {/* 기능 2+3 — 보너스 기능 (나란히) */}
            <div className="md:grid md:grid-cols-2 md:gap-12">
              <div className="border-t border-gray-100 pt-8">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">보너스</span>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">
                  AI 댓글봇
                </h3>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                  이웃 블로그 글을 읽고 맥락에 맞는 댓글을 생성합니다.
                  승인 후 게시되니 자연스러움을 유지할 수 있습니다.
                </p>
              </div>
              <div className="border-t border-gray-100 pt-8 mt-8 md:mt-0">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">보너스</span>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">
                  이웃 자동관리
                </h3>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                  서로이웃 신청, 교류 추적, 테마 기반 추천까지.
                  블로그 네트워크를 자동으로 키워드립니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            매일 1-2시간, 더 가치있게 쓰세요
          </h2>
          <p className="mt-3 text-gray-500">
            글쓰기에 쏟는 시간을 줄이고, 실제 경험에 집중하세요.
          </p>
          <div className="mt-6">
            <Link href="/login?mode=signup">
              <Button size="lg" className="text-base px-8 bg-emerald-600 hover:bg-emerald-700">
                무료로 시작하기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        인성이 AI 블로그 파트너
      </footer>
    </main>
  );
}

function StatItem({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-2xl font-bold text-gray-900">{number}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium flex items-center justify-center">
        {n}
      </span>
      <span className="text-gray-700">{text}</span>
    </div>
  );
}
