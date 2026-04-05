import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ── 3-Step 데이터 ──

const STEPS = [
  {
    step: 1,
    title: "블로그 분석",
    lines: ["내 블로그를", "AI에게", "학습시키기"],
    href: "/persona",
    cta: "페르소나 설정하기",
  },
  {
    step: 2,
    title: "AI로 글쓰기",
    lines: ["사진+메모만", "올리면", "초안 완성"],
    href: "/write",
    cta: "글 쓰러 가기",
  },
  {
    step: 3,
    title: "글 다듬기",
    lines: ["피드백으로", "재생성하면", "AI가 학습"],
    href: null,
    cta: null,
  },
] as const;

// ── 기능 상세 데이터 ──

const FEATURES = [
  {
    title: "페르소나 분석",
    description:
      "블로그 URL을 입력하면 최근 게시물을 크롤링하고, AI가 7가지 카테고리(말투, 이모지, 구조, 마무리, 금지 표현, 기타, 포맷팅)로 글쓰기 스타일을 분석합니다.",
    details: [
      "분석 결과는 항목별로 켜기/끄기 가능하고, 직접 추가도 가능",
      "한 번만 하면 되고, 필요하면 다시 분석할 수 있음",
    ],
  },
  {
    title: "사진+메모로 글 만들기",
    description:
      "사진을 최대 10장 업로드하고, 장소·메뉴·느낀 점 등을 메모로 입력하면 AI가 내 스타일로 제목, 본문, 해시태그를 생성합니다.",
    details: [
      "카테고리 선택은 선택사항 — AI가 자동 감지",
      "페르소나 분석을 먼저 하면 더 정확한 결과",
    ],
  },
  {
    title: "재생성과 피드백",
    description:
      "초안이 마음에 안 들면 수정 요청을 입력해서 재생성할 수 있습니다. 피드백이 5건 쌓이면 AI가 패턴을 분석해서 규칙을 제안합니다.",
    details: [
      '"이모지 줄여줘", "두 번째 문단 자세하게" 등 자유롭게 요청',
      "승인한 규칙은 다음 글부터 자동 적용",
    ],
  },
  {
    title: "네이버 블로그에 붙여넣기",
    description:
      '"HTML 복사" 버튼을 클릭한 뒤 네이버 블로그 에디터에서 Ctrl+V 하면 내 블로그 폰트와 스타일이 그대로 적용됩니다.',
    details: [
      "사진은 직접 삽입 (순서 표시 제공)",
      "폰트, 볼드, 간격까지 재현",
    ],
  },
  {
    title: "댓글 봇 관리",
    description:
      "봇 실행 현황 확인, 댓글 승인/거부, 시간대·한도·모드 설정을 웹에서 관리합니다.",
    details: [
      "수동 승인 모드: AI가 생성한 댓글을 확인 후 승인",
      "자동 모드: AI가 생성 즉시 게시",
    ],
  },
] as const;

// ── FAQ 데이터 ──

const FAQ = [
  {
    q: "사진 몇 장이 적당한가요?",
    a: "3~5장이 가장 좋습니다. 최대 10장까지 업로드할 수 있습니다.",
  },
  {
    q: "메모는 어떻게 쓰면 좋나요?",
    a: "장소, 메뉴, 가격, 느낀 점 등 키워드만 짧게 적어 주세요.",
  },
  {
    q: "페르소나를 다시 분석하고 싶어요",
    a: '페르소나 페이지에서 다시 "블로그 분석하기"를 클릭하면 됩니다.',
  },
  {
    q: "한 달에 몇 번 생성할 수 있나요?",
    a: "무료 10회, 베이직 50회, 프로 200회입니다.",
  },
  {
    q: "재생성도 횟수에 포함되나요?",
    a: "네, 생성과 재생성 모두 포함됩니다.",
  },
] as const;

// ── 페이지 ──

export default function GuidePage() {
  return (
    <div className="space-y-10">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">사용법 가이드</h1>
        <p className="text-sm text-muted-foreground">
          전체 워크플로우를 한눈에 확인하세요
        </p>
      </div>

      {/* 섹션 1: 전체 흐름 3-Step */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">전체 흐름</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.step} className="flex flex-col">
              <CardHeader>
                <CardDescription>Step {s.step}</CardDescription>
                <CardTitle>{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {s.lines.join("\n")}
                </p>
                {s.href && s.cta && (
                  <Link href={s.href}>
                    <Button variant="outline" className="w-full">
                      {s.cta}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 섹션 2: 기능별 상세 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">기능별 안내</h2>
        <div className="space-y-4">
          {FEATURES.map((f, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {f.description}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {f.details.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 섹션 3: FAQ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">자주 묻는 질문</h2>
        <Card>
          <CardContent className="divide-y pt-6">
            {FAQ.map((item, i) => (
              <div key={i} className="py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{item.q}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
