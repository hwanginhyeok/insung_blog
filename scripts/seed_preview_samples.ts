/**
 * 시스템 페르소나 미리보기 샘플 시딩 — 총 16건
 *   - 글쓰기 기본 5종 × 2건 = 10건
 *   - 친근한 댓글 기본 × 3건 = 3건
 *   - 블로그 주인 답글 기본 × 3건 = 3건
 *
 * 실행: NODE_PATH=apps/web/node_modules npx tsx scripts/seed_preview_samples.ts
 *
 * 선행: persona_preview_samples 테이블 (20260411143919 마이그레이션)
 *       시스템 페르소나 7개 (Phase 1 시딩)
 *
 * 재실행 안전: persona_id + sample_type + sort_order 기준으로 중복 체크
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const env: Record<string, string> = {};
for (const line of fs.readFileSync("apps/web/.env.local", "utf-8").split("\n")) {
  if (line.includes("=") && !line.startsWith("#")) {
    const [k, ...v] = line.split("=");
    env[k.trim()] = v.join("=").trim();
  }
}

const sb = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["SUPABASE_SERVICE_ROLE_KEY"]
);

interface Sample {
  topic: string;
  content: string;
}

// ── 글쓰기 카테고리별 샘플 (각 2건) ──
const WRITING_SAMPLES: Record<string, Sample[]> = {
  맛집: [
    {
      topic: "강남역 점심 맛집",
      content:
        "안녕하세요~ 오늘은 강남역 맛있는 점심 먹고 왔어요 😊\n\n평소에 자주 지나치던 곳인데 이번에 드디어 방문해봤네요. 메뉴가 정말 다양하더라구요. 특히 삼겹살이 유명한 집이라서 기대하고 갔어요.\n\n직원분도 친절하시고 반찬 리필도 잘 해주셔서 기분 좋게 식사했답니다. 가격대는 1인 1만 5천원 정도로 점심치곤 살짝 있는 편이지만 양과 질을 생각하면 만족스러웠어요.",
    },
    {
      topic: "가족과 함께 간 한정식집",
      content:
        "주말에 부모님 모시고 한정식집에 다녀왔어요. 어른들이랑 같이 가기 좋은 분위기를 찾다가 발견한 곳이에요.\n\n조용한 골목에 있어서 한적한 분위기가 좋았고, 코스로 나오는 음식이 하나하나 정성스러웠어요. 사진 찍느라 손 바쁘게 움직였네요 ✨\n\n부모님도 만족하셔서 다음 가족 모임 때 또 오려고 합니다. 예약 필수예요!",
    },
  ],
  카페: [
    {
      topic: "조용한 동네 카페",
      content:
        "오늘은 동네 작은 카페에서 오후를 보냈어요 ☕\n\n원목 인테리어에 잔잔한 음악이 흐르는 분위기가 정말 좋았어요. 창가 자리에 앉아서 책 읽기 딱 좋더라구요. 라떼 한 잔 시켜놓고 한참 머물렀네요.\n\n사장님이 직접 로스팅하신 원두라고 하시는데 향이 정말 좋았어요. 작업하기에도 사람 많지 않아서 집중하기 좋은 곳이에요.",
    },
    {
      topic: "디저트 맛집 카페",
      content:
        "디저트가 유명하다는 카페에 다녀왔어요! 인스타에서 보고 가고 싶었던 곳이에요 🍰\n\n시그니처 케이크는 진짜 사진보다 실물이 더 예뻐요. 한 입 먹어보니까 단맛이 너무 강하지 않고 적당해서 좋더라구요. 커피랑 조합도 잘 맞았어요.\n\n주말이라 사람이 좀 있긴 했지만 회전이 빨라서 오래 기다리진 않았어요. 디저트 좋아하시는 분들께 추천!",
    },
  ],
  여행: [
    {
      topic: "제주도 1박 2일",
      content:
        "지난 주말 제주도 다녀왔어요! 짧은 일정이라 동선 잘 짜야 했네요 ✈️\n\n첫째 날은 동쪽 코스로 성산일출봉 → 우도 → 함덕 해변 순으로 돌았어요. 우도는 자전거 타고 한 바퀴 도니까 2시간 정도 걸리더라구요. 바람 좋고 풍경 좋고 최고였어요.\n\n둘째 날은 서귀포 쪽에서 카페 투어 + 올레길 한 코스 걷기로 마무리. 짧지만 알찬 여행이었어요. 다음엔 좀 더 길게 와야겠어요!",
    },
    {
      topic: "당일치기 강원도 드라이브",
      content:
        "오랜만에 당일치기로 강원도 다녀왔어요! 새벽에 출발해서 양양 → 속초 코스로 돌았네요 🚗\n\n양양 서피비치는 사람도 적당하고 분위기 좋아서 사진 많이 찍었어요. 점심은 속초 중앙시장에서 닭강정이랑 오징어순대 먹었는데 역시 시장 음식이 진리예요.\n\n돌아오는 길에 휴게소 들러서 호두과자도 잊지 않고요 ㅎㅎ 당일치기지만 충분히 힐링되는 코스였어요.",
    },
  ],
  일상: [
    {
      topic: "주말 홈카페 만들기",
      content:
        "비 오는 주말이라 집에서 홈카페 즐겼어요 ☔\n\n원두 갈아서 핸드드립으로 천천히 내려 마셨는데 카페 못지 않더라구요. 베이킹도 도전해서 스콘을 구웠는데 처음치곤 잘 된 것 같아요. 집안 가득 빵 굽는 냄새가 진짜 좋았어요.\n\n바깥은 비 오고 안에서 따뜻한 커피 마시면서 책 읽으니까 이런 게 진짜 행복인 것 같네요. 다들 즐거운 주말 보내세요~",
    },
    {
      topic: "오랜만에 만난 친구",
      content:
        "오랜만에 대학 친구를 만났어요 🥹\n\n코로나 이후로 거의 1년 만에 본 건데 어제 만난 것처럼 어색함 없이 수다 떨었네요. 역시 오래된 친구는 시간이 지나도 변하지 않는 것 같아요.\n\n근황 얘기하다가 결혼 준비하는 친구들 얘기도 나오고, 이제 우리도 그런 나이구나 싶더라구요. 다음엔 좀 더 자주 보자고 약속하고 헤어졌어요. 오늘 하루도 감사합니다.",
    },
  ],
  리뷰: [
    {
      topic: "무선 이어폰 한 달 사용 후기",
      content:
        "한 달 동안 사용해본 무선 이어폰 솔직 후기 남겨봐요.\n\n장점: 배터리 오래가고 페어링 빠른 게 정말 편해요. 음질도 가격대 생각하면 만족스러운 수준이에요. 통화 품질도 깔끔한 편.\n\n단점: 케이스가 살짝 미끄러워서 떨어뜨릴 뻔한 적이 몇 번 있어요. 케이스 따로 사야 할 것 같네요.\n\n결론: 입문용으로는 충분히 좋은 제품이에요. 음질에 예민하신 분들은 한 단계 위 제품을 추천드립니다.",
    },
    {
      topic: "인기 도서 읽고 난 솔직 후기",
      content:
        "베스트셀러라길래 호기심에 읽어봤어요 📖\n\n초반에는 좀 지루하다 싶었는데 중반부터 흐름이 빨라져서 단숨에 끝까지 읽었네요. 작가의 문체가 담백하면서도 깊이가 있어서 인상적이었어요.\n\n다만 결말이 호불호가 갈릴 것 같아요. 저는 여운이 남아서 좋았는데 명쾌한 결말 좋아하시는 분들은 아쉬울 수 있겠어요.\n\n에세이 좋아하시는 분들께 추천드려요!",
    },
  ],
};

// ── 댓글 샘플 3건 ──
const COMMENT_SAMPLES: Sample[] = [
  {
    topic: "맛집 글에 댓글",
    content: "와 사진 진짜 맛있어 보이네요~ 저도 다음에 가봐야겠어요 😋 후기 잘 보고 갑니다!",
  },
  {
    topic: "카페 글에 댓글",
    content:
      "여기 분위기 너무 좋아 보여요. 저도 카페 다니는 거 좋아하는데 다음 주말에 한번 가봐야겠어요. 사진도 예쁘게 찍으셨네요 ✨",
  },
  {
    topic: "여행 글에 댓글",
    content:
      "여행 코스 잘 짜셨네요~ 저도 다음에 같은 코스로 가보고 싶어요. 정보 공유 감사합니다 :)",
  },
];

// ── 답글 샘플 3건 ──
const REPLY_SAMPLES: Sample[] = [
  {
    topic: "맛집 후기에 달린 댓글에 답글",
    content: "와주셔서 감사해요~ 시간 되시면 꼭 한번 가보세요 😊",
  },
  {
    topic: "공감 댓글에 답글",
    content: "공감해주셔서 감사합니다! 저도 이런 댓글 보면 힘이 나요 💕",
  },
  {
    topic: "질문 댓글에 답글",
    content: "안녕하세요~ 글 봐주셔서 감사해요. 궁금하신 부분은 다음 글에 자세히 정리해볼게요!",
  },
];

async function seed() {
  console.log("🌱 시스템 페르소나 미리보기 샘플 시딩\n");

  // 1. 시스템 페르소나 조회
  const { data: personas, error: e1 } = await sb
    .from("user_personas")
    .select("id, display_name, purpose, category")
    .eq("is_system", true);

  if (e1 || !personas) {
    console.error("❌ 시스템 페르소나 조회 실패:", e1);
    return;
  }

  console.log(`   시스템 페르소나: ${personas.length}개`);

  let created = 0;
  let skipped = 0;

  for (const persona of personas) {
    let samples: Sample[] = [];
    let sampleType: "writing" | "comment" | "reply" = "writing";

    if (persona.purpose === "writing" && persona.category) {
      samples = WRITING_SAMPLES[persona.category] || [];
      sampleType = "writing";
    } else if (persona.purpose === "comment") {
      samples = COMMENT_SAMPLES;
      sampleType = "comment";
    } else if (persona.purpose === "reply") {
      samples = REPLY_SAMPLES;
      sampleType = "reply";
    }

    if (samples.length === 0) {
      console.log(`   ⏭️  ${persona.display_name} — 매칭 샘플 없음`);
      continue;
    }

    // 기존 샘플 확인 (재실행 안전)
    const { count: existing } = await sb
      .from("persona_preview_samples")
      .select("*", { count: "exact", head: true })
      .eq("persona_id", persona.id)
      .eq("sample_type", sampleType);

    if ((existing || 0) >= samples.length) {
      console.log(`   ⏭️  ${persona.display_name} (이미 ${existing}개 존재)`);
      skipped++;
      continue;
    }

    // 일괄 INSERT
    const payload = samples.map((s, idx) => ({
      persona_id: persona.id,
      sample_type: sampleType,
      topic: s.topic,
      content: s.content,
      sort_order: idx,
      generated_by: "system" as const,
    }));

    const { error: insertErr } = await sb.from("persona_preview_samples").insert(payload);

    if (insertErr) {
      console.error(`   ❌ ${persona.display_name} 시딩 실패:`, insertErr);
      continue;
    }

    console.log(`   ✅ ${persona.display_name} (${samples.length}개)`);
    created += samples.length;
  }

  console.log(`\n📊 결과: 생성 ${created}건 / 스킵 ${skipped}개 페르소나`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("시딩 실패:", err);
    process.exit(1);
  });
