import { describe, it, expect } from "vitest";
import { isProgressResult } from "../../app/(dashboard)/(social)/bot/_lib/bot-api";

describe("isProgressResult 타입 가드", () => {
  it("정상 ProgressResult 객체 → true 반환", () => {
    expect(
      isProgressResult({ progress: 3, total: 10, success: 2, failed: 1 })
    ).toBe(true);
  });

  it("null → false 반환", () => {
    expect(isProgressResult(null)).toBe(false);
  });

  it("MessageResult (문자열 필드) → false 반환", () => {
    expect(isProgressResult({ message: "완료" })).toBe(false);
  });

  it("숫자 필드가 문자열인 경우 → false 반환 (백엔드 타입 불일치 방어)", () => {
    expect(
      isProgressResult({ progress: "3", total: 10, success: 2, failed: 1 })
    ).toBe(false);
  });

  it("progress=0, total=0 → true (0/0 케이스 허용)", () => {
    expect(
      isProgressResult({ progress: 0, total: 0, success: 0, failed: 0 })
    ).toBe(true);
  });
});
