import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv-parser";

describe("CSV parsing", () => {
  it("preserves quoted commas, newlines, escaped quotes, and BOM", () => {
    expect(parseCsv('\uFEFF日期,备注\r\n2026-01-01,"a,\n""b"""\r\n')).toEqual([
      ["日期", "备注"], ["2026-01-01", 'a,\n"b"'],
    ]);
  });
  it("rejects malformed data rather than silently truncating it", () => {
    expect(() => parseCsv('a,b\n"unclosed')).toThrow(/unclosed/);
    expect(() => parseCsv('a,b\n1')).toThrow(/record 2/);
    expect(() => parseCsv('a,a\n1,2')).toThrow(/unique/);
    expect(() => parseCsv(Array(101).fill("x").join(","))).toThrow(/100 column/);
  });
  it("preserves cells and columns beyond the preview limits", () => {
    const headers = Array.from({ length: 31 }, (_, i) => `column${i}`);
    const values = Array(31).fill("x".repeat(501));
    expect(parseCsv(`${headers.join(",")}\n${values.join(",")}`)[1]).toEqual(values);
  });
});
