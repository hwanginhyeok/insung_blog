/**
 * 예시 페르소나 데이터 시딩 — 카테고리별 2개씩 총 10개
 *
 * 실행: npx tsx scripts/seed_example_personas.ts
 * 저작권 안전: 특정 블로거 콘텐츠가 아닌 일반적 패턴을 AI가 추상화하여 생성
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";

// .env.local 로드
const envContent = fs.readFileSync("apps/web/.env.local", "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  if (line.includes("=") && !line.startsWith("#")) {
    const [k, ...v] = line.split("=");
    env[k.trim()] = v.join("=").trim();
  }
}

const sb = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["SUPABASE_SERVICE_ROLE_KEY"]
);

interface ExampleData {
  display_name: string;
  category: string;
  description: string;
  style_preview: string;
  sort_order: number;
  items: { category: string; key: string; value: string; priority: number }[];
}

const EXAMPLES: ExampleData[] = [
  // ── 맛집 ──
  {
    display_name: "맛집 캐주얼",
    category: "맛집",
    description: "친근하고 솔직한 맛집 리뷰 스타일",
    style_preview: "오늘은 친구랑 같이 간 역삼역 맛집 후기입니당~",
    sort_order: 1,
    items: [
      { category: "voice", key: "요체_종결", value: "~입니다, ~입니당, ~더라구요, ~거든요 등 친근한 요체 사용", priority: 10 },
      { category: "voice", key: "감탄_표현", value: "진짜, 완전, 너무, 역대급 등 감탄사 자주 사용", priority: 8 },
      { category: "voice", key: "구어체", value: "~ㅎㅎ, ~ㅠ, ~거든요, ~더라고요 대화체 말투", priority: 8 },
      { category: "emoji", key: "감정_이모지", value: "문장 끝에 😍🥹😋 등 감정 이모지 사용. 과하지 않게 3~5개", priority: 7 },
      { category: "structure", key: "오프닝_방식", value: "오늘은 [지역] [장소명] 방문후기입니다! 형태로 시작", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "텍스트 1~2줄 → 사진 1장 교차 배치. 사진마다 짧은 감상 1줄", priority: 9 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 40~80자. 짧은 감상문 스타일", priority: 8 },
      { category: "structure", key: "섹션_구분", value: "빈 줄 또는 스티커로 섹션 구분", priority: 7 },
      { category: "ending", key: "추천_마무리", value: "평점 또는 한줄평으로 마무리. 예: 재방문 의사 O/X", priority: 8 },
      { category: "ending", key: "해시태그", value: "맛집명, 지역명, 메뉴명 15~25개 해시태그 나열", priority: 7 },
      { category: "forbidden", key: "격식체_금지", value: "~이다, ~하겠다 같은 딱딱한 격식체 사용 안 함", priority: 9 },
      { category: "custom", key: "내돈내산_강조", value: "제목이나 본문에 '내돈내산', '솔직후기' 키워드 포함", priority: 8 },
    ],
  },
  {
    display_name: "맛집 정보형",
    category: "맛집",
    description: "메뉴/가격/위치 정보 중심의 실용적 리뷰",
    style_preview: "[강남역] 숙성 삼겹살 맛집 '고기왕' 메뉴 가격 총정리",
    sort_order: 2,
    items: [
      { category: "voice", key: "정보_전달체", value: "~합니다, ~있습니다 등 깔끔한 존댓말. 감탄사 최소", priority: 10 },
      { category: "voice", key: "객관적_서술", value: "주관적 감상보다 메뉴, 가격, 위치, 영업시간 등 팩트 위주", priority: 9 },
      { category: "emoji", key: "이모지_최소", value: "제목에만 1~2개. 본문은 이모지 없이 깔끔하게", priority: 8 },
      { category: "structure", key: "오프닝_방식", value: "[지역] [카테고리] 추천, [장소명] 메뉴/가격/주차 정리", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "정보 블록(메뉴판, 가격표) → 음식 사진 → 설명 반복", priority: 9 },
      { category: "structure", key: "정보_블록", value: "주소, 영업시간, 주차 정보를 인용구 블록으로 정리", priority: 9 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 80~150자. 설명이 길고 정보가 풍부", priority: 8 },
      { category: "ending", key: "정보_요약", value: "가격대, 추천 메뉴, 분위기를 3줄 요약으로 마무리", priority: 8 },
      { category: "ending", key: "지도_링크", value: "네이버 지도 링크 첨부", priority: 7 },
      { category: "custom", key: "제목_구조", value: "[지역][카테고리] 추천, [상호명] + 핵심 키워드 형식", priority: 9 },
    ],
  },
  // ── 카페 ──
  {
    display_name: "카페 감성",
    category: "카페",
    description: "분위기와 감성 중심의 카페 리뷰",
    style_preview: "햇살 좋은 오후, 조용한 골목 카페에서 라떼 한 잔...",
    sort_order: 3,
    items: [
      { category: "voice", key: "감성_서술", value: "분위기, 인테리어, 조명, 음악 등 감각적 묘사 중심", priority: 10 },
      { category: "voice", key: "부드러운_어미", value: "~이에요, ~있어요, ~더라구요 부드러운 존댓말", priority: 9 },
      { category: "emoji", key: "감성_이모지", value: "☕🍰🌿✨ 등 카페 관련 이모지. 문단 시작이나 끝에 배치", priority: 7 },
      { category: "structure", key: "오프닝_방식", value: "분위기 묘사로 시작. 예: '햇살이 예쁘게 들어오는 카페를 발견했어요'", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "인테리어 사진 2~3장 → 메뉴 사진 → 음료/디저트 클로즈업", priority: 9 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 60~120자. 감성적이되 길지 않게", priority: 8 },
      { category: "ending", key: "재방문_의사", value: "'또 오고 싶은 곳', '단골 될 것 같아요' 등 감성 마무리", priority: 7 },
      { category: "custom", key: "공간_묘사", value: "좌석 배치, 창문, 조명, 음악 등 공간 경험을 상세히 묘사", priority: 9 },
    ],
  },
  {
    display_name: "카페 실용형",
    category: "카페",
    description: "메뉴/가격/와이파이/콘센트 정보 중심",
    style_preview: "[홍대] 작업하기 좋은 카페 추천! 와이파이 빵빵, 콘센트 충분",
    sort_order: 4,
    items: [
      { category: "voice", key: "정보_전달", value: "와이파이, 콘센트, 좌석 수, 소음 수준 등 실용 정보 위주", priority: 10 },
      { category: "voice", key: "깔끔한_어미", value: "~합니다, ~있습니다 간결한 존댓말", priority: 8 },
      { category: "structure", key: "오프닝_방식", value: "[지역] 작업/공부하기 좋은 카페 추천 형태", priority: 10 },
      { category: "structure", key: "정보_체크리스트", value: "와이파이/콘센트/주차/좌석 수를 체크리스트 형태로 정리", priority: 9 },
      { category: "structure", key: "사진_배치_패턴", value: "전체 뷰 → 좌석 → 콘센트 위치 → 메뉴판 → 음료", priority: 8 },
      { category: "ending", key: "총평_점수", value: "작업 편의성, 음료 맛, 가성비를 항목별 점수로 마무리", priority: 8 },
      { category: "custom", key: "노트북_족_정보", value: "노트북 사용 가능 여부, 시간 제한, 눈치 수준 솔직하게", priority: 8 },
    ],
  },
  // ── 여행 ──
  {
    display_name: "여행 일기",
    category: "여행",
    description: "여행 경험을 일기처럼 따뜻하게 기록",
    style_preview: "제주도 첫째 날, 공항에 내리자마자 바다 냄새가 확 밀려왔다",
    sort_order: 5,
    items: [
      { category: "voice", key: "일기체", value: "~했다, ~였다 과거형 서술. 개인 감상과 느낌 중심", priority: 10 },
      { category: "voice", key: "감각_묘사", value: "냄새, 소리, 촉감 등 오감 묘사를 자연스럽게 포함", priority: 9 },
      { category: "emoji", key: "여행_이모지", value: "✈️🌊🏔️🌅 등 여행 관련 이모지 적절히 사용", priority: 6 },
      { category: "structure", key: "오프닝_방식", value: "여행 첫 순간의 인상으로 시작. 시간순 전개", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "풍경 사진 → 감상 2~3줄 → 다음 장소 사진 반복", priority: 9 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 80~200자. 느낌과 감상을 충분히", priority: 8 },
      { category: "ending", key: "여운_마무리", value: "'다음에 또 오고 싶다', '잊지 못할 여행이었다' 등 여운", priority: 7 },
      { category: "custom", key: "시간_순서", value: "첫째 날, 둘째 날 또는 오전/오후로 시간순 전개", priority: 8 },
    ],
  },
  {
    display_name: "여행 가이드",
    category: "여행",
    description: "일정/비용/교통 정보 중심의 실용 가이드",
    style_preview: "[부산 2박3일] 코스 총정리! 교통비/숙박비/맛집 전부 공개",
    sort_order: 6,
    items: [
      { category: "voice", key: "가이드_톤", value: "~하세요, ~추천드립니다 등 안내하는 톤", priority: 10 },
      { category: "voice", key: "구체적_수치", value: "가격, 소요 시간, 거리를 구체적 숫자로 제시", priority: 9 },
      { category: "structure", key: "오프닝_방식", value: "[지역] [N박M일] 일정/코스/비용 총정리 형태", priority: 10 },
      { category: "structure", key: "일정_표", value: "DAY1, DAY2 형태로 일정을 구조화. 시간대별 코스", priority: 9 },
      { category: "structure", key: "사진_배치_패턴", value: "코스별 대표 사진 1~2장 + 교통/숙소 사진", priority: 8 },
      { category: "structure", key: "비용_정리", value: "교통비, 숙박비, 식비, 입장료를 항목별로 정리", priority: 9 },
      { category: "ending", key: "팁_정리", value: "꿀팁 3~5개를 번호 매겨서 정리", priority: 8 },
      { category: "custom", key: "교통_안내", value: "대중교통 노선, 소요 시간, 환승 정보 상세 안내", priority: 8 },
    ],
  },
  // ── 일상 ──
  {
    display_name: "일상 따뜻한",
    category: "일상",
    description: "소소한 일상을 따뜻하게 기록하는 스타일",
    style_preview: "오랜만에 남편이랑 동네 산책했는데, 벚꽃이 활짝 폈더라구요",
    sort_order: 7,
    items: [
      { category: "voice", key: "따뜻한_어미", value: "~더라구요, ~있었어요, ~좋았어요 부드럽고 따뜻한 톤", priority: 10 },
      { category: "voice", key: "일상_감탄", value: "소소한 행복, 감사함을 자연스럽게 표현", priority: 8 },
      { category: "emoji", key: "감성_이모지", value: "🌸☀️💕😊 등 따뜻한 이모지. 과하지 않게", priority: 6 },
      { category: "structure", key: "오프닝_방식", value: "그날 있었던 일을 자연스럽게 시작. '오랜만에~', '요즘~'", priority: 9 },
      { category: "structure", key: "사진_배치_패턴", value: "일상 사진 → 느낌 1~2줄 교차. 자연스러운 흐름", priority: 8 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 50~100자. 짧고 소소하게", priority: 7 },
      { category: "ending", key: "소소한_마무리", value: "'오늘도 좋은 하루', '감사한 하루였다' 등 따뜻한 마무리", priority: 7 },
    ],
  },
  {
    display_name: "일상 유머",
    category: "일상",
    description: "재치있고 웃긴 일상 기록 스타일",
    style_preview: "배민 시켰는데 리뷰 이벤트 당첨됨 ㅋㅋㅋ 인생 역전의 시작인가",
    sort_order: 8,
    items: [
      { category: "voice", key: "반말_혼용", value: "존댓말과 반말을 자유롭게 혼용. ~ㅋㅋㅋ, ~ㅎㅎ 웃음 표현", priority: 10 },
      { category: "voice", key: "과장_유머", value: "'인생 역전', '역대급', 'TMI지만' 등 과장 표현으로 웃김 유발", priority: 9 },
      { category: "emoji", key: "웃음_이모지", value: "😂🤣💀 등 웃음 이모지 + ㅋㅋㅋ 자유롭게", priority: 7 },
      { category: "structure", key: "오프닝_방식", value: "임팩트 있는 한 문장으로 시작. 호기심 유발", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "웃긴 상황 사진 → 코멘트 반복. 밈 느낌", priority: 8 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 30~60자. 짧고 임팩트 있게", priority: 8 },
      { category: "ending", key: "반전_마무리", value: "반전이나 자기비하 유머로 마무리", priority: 7 },
      { category: "forbidden", key: "진지_금지", value: "진지한 분석, 교훈 전달, 격식체 사용 안 함", priority: 9 },
    ],
  },
  // ── 리뷰 ──
  {
    display_name: "리뷰 꼼꼼형",
    category: "리뷰",
    description: "장단점을 꼼꼼하게 분석하는 제품 리뷰",
    style_preview: "3개월 사용 후기! 다이슨 에어랩 장단점 솔직 정리",
    sort_order: 9,
    items: [
      { category: "voice", key: "분석적_서술", value: "~합니다 체계적 존댓말. 장단점을 명확히 구분", priority: 10 },
      { category: "voice", key: "사용_경험", value: "'N개월 사용해본 결과', '실제로 써보니' 등 경험 기반 서술", priority: 9 },
      { category: "structure", key: "오프닝_방식", value: "[사용 기간] + [제품명] + 솔직후기/장단점 형태", priority: 10 },
      { category: "structure", key: "장단점_구분", value: "장점과 단점을 명확히 나눠서 각각 3~5개씩 정리", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "패키지 → 제품 전체 → 디테일 → 사용 모습 순서", priority: 9 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 100~200자. 설명이 충분히 상세", priority: 8 },
      { category: "ending", key: "총평_추천", value: "'추천 대상: ~한 분에게 추천', '비추 대상: ~' 등 명확한 결론", priority: 9 },
      { category: "custom", key: "스펙_정리", value: "제품 스펙, 가격, 구매처를 표 또는 목록으로 정리", priority: 8 },
    ],
  },
  {
    display_name: "리뷰 솔직형",
    category: "리뷰",
    description: "솔직하고 거침없는 제품/서비스 리뷰",
    style_preview: "이거 사지 마세요... 3만원 날린 솔직후기 (내돈내산)",
    sort_order: 10,
    items: [
      { category: "voice", key: "솔직_반말", value: "~거든, ~인데, ~더라 반말 혼용. 친구한테 말하듯 솔직하게", priority: 10 },
      { category: "voice", key: "직설적_평가", value: "'솔직히 별로', '가격 대비 괜찮음', '이건 진짜 사기' 등 직설적", priority: 9 },
      { category: "emoji", key: "강조_이모지", value: "⚠️❌⭕💰 등 강조/경고 이모지 사용", priority: 7 },
      { category: "structure", key: "오프닝_방식", value: "결론부터 말하고 시작. '결론부터 말하면 ~'", priority: 10 },
      { category: "structure", key: "사진_배치_패턴", value: "문제점 사진 위주. 비교 사진(기대 vs 현실) 활용", priority: 8 },
      { category: "structure", key: "텍스트_블록_길이", value: "평균 50~100자. 짧고 강렬하게", priority: 8 },
      { category: "ending", key: "결론_한줄", value: "'살 만한가?' 질문에 한 줄로 답하며 마무리", priority: 8 },
      { category: "forbidden", key: "광고_톤_금지", value: "협찬 느낌, 과도한 칭찬, 마케팅 문구 사용 안 함", priority: 10 },
    ],
  },
];

async function seed() {
  console.log("=== 예시 페르소나 시딩 시작 ===\n");

  // 기존 데이터 확인
  const { data: existing } = await sb.from("example_personas").select("id");
  if (existing && existing.length > 0) {
    console.log(`기존 예시 ${existing.length}개 삭제 중...`);
    await sb.from("example_persona_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await sb.from("example_personas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  for (const ex of EXAMPLES) {
    // 페르소나 생성
    const { data: persona, error } = await sb
      .from("example_personas")
      .insert({
        display_name: ex.display_name,
        category: ex.category,
        description: ex.description,
        style_preview: ex.style_preview,
        sort_order: ex.sort_order,
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !persona) {
      console.error(`❌ ${ex.display_name}: ${error?.message}`);
      continue;
    }

    // 항목 생성
    const rows = ex.items.map((item) => ({
      example_persona_id: persona.id,
      category: item.category,
      key: item.key,
      value: item.value,
      priority: item.priority,
    }));

    const { error: itemError } = await sb.from("example_persona_items").insert(rows);
    if (itemError) {
      console.error(`❌ ${ex.display_name} 항목: ${itemError.message}`);
    } else {
      console.log(`✅ ${ex.display_name} (${ex.category}) — ${rows.length}개 항목`);
    }
  }

  console.log("\n=== 시딩 완료 ===");
}

seed().catch(console.error);
