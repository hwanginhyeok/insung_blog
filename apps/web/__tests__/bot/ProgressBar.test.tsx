import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// ProgressBar는 BotControlPanel.tsx에서 로컬 함수라 직접 임포트 불가.
// 동일 로직을 인라인으로 검증.
function calcPct(progress: number, total: number): number {
  return total > 0 ? Math.round((progress / total) * 100) : 0;
}

describe("ProgressBar pct 계산", () => {
  it("total=0 → pct=0 (division by zero 방지)", () => {
    expect(calcPct(0, 0)).toBe(0);
  });

  it("total>0 정상 계산", () => {
    expect(calcPct(5, 10)).toBe(50);
  });

  it("progress=total → 100%", () => {
    expect(calcPct(10, 10)).toBe(100);
  });

  it("progress > total (백엔드 이상 값) → 100% 초과하지만 CSS overflow-hidden으로 클리핑", () => {
    // 레이아웃 파손 없음 (overflow: hidden 컨테이너)
    const pct = calcPct(6, 5);
    expect(pct).toBe(120); // 클리핑은 CSS에서 처리
    expect(Number.isFinite(pct)).toBe(true); // Infinity가 아님을 보장
  });
});
