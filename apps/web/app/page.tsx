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
            <p className="text-sm font-medium text-primary tracking-wide uppercase animate-fade-up">
              AI 블로그 파트너
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold text-foreground leading-[1.15] sm:leading-[1.15] md:leading-[1.15] animate-fade-up anim-delay-1">
              경험에 집중하세요.
              <br />
              글은 AI가 쓸게요.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed animate-fade-up anim-delay-2">
              사진과 메모만 올리면 당신만의 스타일로 블로그 글을 완성합니다.
              체험단 리뷰, 맛집 후기, 일상 기록까지.
            </p>
            <div className="mt-8 flex items-center gap-4 animate-fade-up anim-delay-3">
              <Button size="lg" className="text-base px-8" asChild>
                <Link href="/login">무료로 시작하기</Link>
              </Button>
              <span className="text-sm text-muted-foreground">월 5회 무료</span>
            </div>
            {/* 모바일 — 인라인 스탯 배지 */}
            <div className="mt-6 flex flex-wrap gap-2 md:hidden">
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">1분 글쓰기</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">일 200개 댓글</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">이웃 자동관리</span>
            </div>
          </div>

          {/* 데스크톱 — 제품 프리뷰 + 스탯 (2/5) */}
          <div className="hidden md:block md:col-span-2">
            {/* 미니 제품 UI 프리뷰 */}
            <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
              {/* 브라우저 바 */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 bg-muted border-b border-border">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="ml-3 text-xs text-muted-foreground">인성이 — AI 글쓰기</span>
              </div>
              {/* 프리뷰 콘텐츠 */}
              <div className="p-5 space-y-3">
                <div className="flex gap-2">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-lg">
                    &#128247;
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-lg">
                    &#128247;
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    +2
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2.5 w-4/5 rounded bg-foreground/10" />
                  <div className="h-2.5 w-full rounded bg-foreground/10" />
                  <div className="h-2.5 w-3/5 rounded bg-foreground/10" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-3/4 rounded-full bg-primary animate-pulse" />
                  </div>
                  <span className="text-xs text-muted-foreground">AI 작성 중...</span>
                </div>
              </div>
            </div>

            {/* 스탯 */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniStat number="1분" label="글쓰기" />
              <MiniStat number="200개" label="일 댓글" />
              <MiniStat number="자동" label="이웃관리" />
            </div>
          </div>
        </div>
      </section>

      {/* 기능 섹션 — 2컬럼 비대칭 */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-foreground animate-fade-up">
            블로그 운영, 이렇게 바뀝니다
          </h2>

          <div className="mt-12 space-y-16">
            {/* 기능 1 — AI 글쓰기 (메인) */}
            <div className="md:grid md:grid-cols-2 md:gap-12 md:items-start">
              <div>
                <span className="text-sm font-medium text-primary">핵심 기능</span>
                <h3 className="mt-2 text-xl font-semibold text-foreground">
                  AI가 당신의 말투를 학습합니다
                </h3>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  페르소나 분석으로 당신만의 글쓰기 스타일을 파악하고,
                  사진에서 감정과 분위기를 읽어 자연스러운 글을 작성합니다.
                  복사해서 바로 네이버에 발행하세요.
                </p>
              </div>
              <div className="mt-6 md:mt-0 bg-muted rounded-xl p-6">
                <div className="text-sm text-muted-foreground mb-2">이렇게 사용하세요</div>
                <div className="space-y-3 text-sm">
                  <Step n="1" text="회원가입 + 네이버 쿠키 등록" />
                  <Step n="2" text="사진과 메모만 올리면 AI가 글 작성" />
                  <Step n="3" text="댓글봇 실행 → 승인 → 자동 게시" />
                  <Step n="4" text="이웃 자동 발견 + 서로이웃 신청" />
                </div>
              </div>
            </div>

            {/* 기능 2+3 — 보너스 기능 (나란히) */}
            <div className="md:grid md:grid-cols-2 md:gap-12">
              <div className="border-t border-border pt-8">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">보너스</span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  AI 댓글봇 + 대댓글
                </h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">
                  이웃 블로그 글을 읽고 맥락에 맞는 댓글을 자동 생성합니다.
                  내 글에 달린 댓글에도 AI가 따뜻하게 답글을 달아줍니다.
                  프로 기준 하루 최대 200개 댓글, 100개 답글.
                </p>
              </div>
              <div className="border-t border-border pt-8 mt-8 md:mt-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">보너스</span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  이웃 자동관리
                </h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">
                  테마 기반 새 이웃 발견, 서로이웃 자동 신청,
                  이웃 새글 피드 댓글까지. 교류 추적과 추천 알고리즘으로
                  블로그 네트워크를 자동으로 키워줍니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="border-t border-border bg-muted">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-foreground animate-fade-up">
            블로그 운영, AI에게 맡기세요
          </h2>
          <p className="mt-3 text-muted-foreground animate-fade-up anim-delay-1">
            글쓰기, 댓글, 이웃관리까지 한 곳에서. 무료로 시작하세요.
          </p>
          <div className="mt-6">
            <Button size="lg" className="text-base px-8" asChild>
              <Link href="/login">무료로 시작하기</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/60">인성이 — AI 블로그 파트너</p>
        <p>문의: insungblog@gmail.com</p>
      </footer>
    </main>
  );
}

function MiniStat({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center rounded-xl bg-muted px-3 py-3">
      <div className="text-lg font-bold text-foreground">{number}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
        {n}
      </span>
      <span className="text-foreground">{text}</span>
    </div>
  );
}
