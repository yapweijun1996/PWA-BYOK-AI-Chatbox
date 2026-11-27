import { describe, expect, it } from "vitest";
import { virtualMessageRange } from "../src/virtual-message-layout";

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
});
