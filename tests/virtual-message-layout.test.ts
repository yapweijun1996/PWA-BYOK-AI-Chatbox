import { describe, expect, it } from "vitest";
import { virtualMessageRange, virtualMessageSegments } from "../src/virtual-message-layout";

describe("virtual message range", () => {
  it("includes overscan and accounts for the omitted height", () => {
    const range = virtualMessageRange(Array(100).fill(100), 4000, 500);
    expect(range).toEqual({ start: 29, end: 55, before: 2900, after: 4500 });
    expect(range.before + (range.end - range.start) * 100 + range.after).toBe(
      10000,
    );
  });
  it("handles empty lists, endpoints and invalid estimates", () => {
    expect(virtualMessageRange([], 0, 500)).toEqual({
      start: 0,
      end: 0,
      before: 0,
      after: 0,
    });
    expect(virtualMessageRange([0, -1, NaN], 9999, 100)).toEqual({
      start: 3,
      end: 3,
      before: 540,
      after: 0,
    });
    expect(virtualMessageRange([50, 60], 0, 100)).toEqual({
      start: 0,
      end: 2,
      before: 0,
      after: 0,
    });
  });
  it("keeps isolated retained messages and represents the gaps exactly", () => {
    expect(virtualMessageSegments([10, 20, 30, 40, 50, 60], { start: 2, end: 4, before: 30, after: 110 }, new Set([0, 5]))).toEqual([
      { kind: "rows", start: 0, end: 1 },
      { kind: "gap", start: 1, end: 2, height: 20 },
      { kind: "rows", start: 2, end: 4 },
      { kind: "gap", start: 4, end: 5, height: 50 },
      { kind: "rows", start: 5, end: 6 },
    ]);
    expect(virtualMessageSegments([0, NaN], { start: 2, end: 2, before: 360, after: 0 }, new Set())).toEqual([{ kind: "gap", start: 0, end: 2, height: 360 }]);
  });
});
