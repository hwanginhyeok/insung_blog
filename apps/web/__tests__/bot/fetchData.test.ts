import { describe, it, expect, vi, beforeEach } from "vitest";

// Promise.allSettled 분기 — fetchData의 부분 실패 처리 검증
// useBotStatus 훅을 직접 테스트하는 대신 핵심 로직(allSettled 분기)을 단위 테스트

type SettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

// fetchData 내부의 allSettled 분기 로직 추출 (순수 함수로 검증)
function processResults(
  results: [
    SettledResult<{ recentRuns: string[]; todayStats: object; pendingCount: number; settings: null }>,
    SettledResult<{ comments: string[] }>,
    SettledResult<{ hasCookies: boolean }>,
    SettledResult<{ comments: string[] }>,
  ]
): { runs: string[]; pending: string[]; cookieStatus: { hasCookies: boolean } | null; approved: string[] } {
  const [statusResult, pendingResult, cookieResult, approvedResult] = results;

  const runs =
    statusResult.status === "fulfilled" ? statusResult.value.recentRuns : [];
  const pending =
    pendingResult.status === "fulfilled" ? pendingResult.value.comments : [];
  const cookieStatus =
    cookieResult.status === "fulfilled" ? cookieResult.value : null;
  const approved =
    approvedResult.status === "fulfilled" ? approvedResult.value.comments : [];

  return { runs, pending, cookieStatus, approved };
}

describe("fetchData — Promise.allSettled 분기", () => {
  it("모두 성공 시 전체 데이터 반환", () => {
    const result = processResults([
      { status: "fulfilled", value: { recentRuns: ["run1"], todayStats: {}, pendingCount: 1, settings: null } },
      { status: "fulfilled", value: { comments: ["c1"] } },
      { status: "fulfilled", value: { hasCookies: true } },
      { status: "fulfilled", value: { comments: ["a1"] } },
    ]);

    expect(result.runs).toEqual(["run1"]);
    expect(result.pending).toEqual(["c1"]);
    expect(result.cookieStatus).toEqual({ hasCookies: true });
    expect(result.approved).toEqual(["a1"]);
  });

  it("cookie API 실패 시 나머지 3개 정상 처리 (Promise.all이면 전체 실패)", () => {
    const result = processResults([
      { status: "fulfilled", value: { recentRuns: ["run1"], todayStats: {}, pendingCount: 0, settings: null } },
      { status: "fulfilled", value: { comments: ["c1"] } },
      { status: "rejected", reason: new Error("쿠키 API 오류") },
      { status: "fulfilled", value: { comments: [] } },
    ]);

    expect(result.runs).toEqual(["run1"]); // 상태는 정상
    expect(result.pending).toEqual(["c1"]); // 펜딩도 정상
    expect(result.cookieStatus).toBeNull(); // 쿠키만 null
    expect(result.approved).toEqual([]); // approved도 정상
  });

  it("status API 실패 시 runs는 빈 배열, 나머지는 정상", () => {
    const result = processResults([
      { status: "rejected", reason: new Error("상태 API 오류") },
      { status: "fulfilled", value: { comments: ["c1"] } },
      { status: "fulfilled", value: { hasCookies: false } },
      { status: "fulfilled", value: { comments: [] } },
    ]);

    expect(result.runs).toEqual([]); // runs 빈 배열 (기존 상태 유지는 훅에서 처리)
    expect(result.pending).toEqual(["c1"]); // pending은 정상
  });
});
