import { describe, expect, it } from "vitest";
import { javascriptPreviewReport } from "../src/preview-export";
import type { ExecutionResult } from "../src/js-tool-runtime";

describe("JavaScript preview export", () => {
  it("preserves the displayed status, result, console and truncation notice", () => {
    const result: ExecutionResult = { status: "success", durationMs: 5, value: { format: "json", text: "42" }, console: [], truncated: false };
    expect(javascriptPreviewReport(result, [{ level: "warn", text: "warning" }], true)).toBe("Status: success\n\nResult:\n42\n\nConsole:\n[warn] warning\n(Some output was omitted.)\n");
  });
  it("reports errors and an empty console", () => {
    const result: ExecutionResult = { status: "error", durationMs: 0, error: { code: "javascript", message: "bad code" }, console: [], truncated: false };
    expect(javascriptPreviewReport(result, [], false)).toContain("Status: error\nError: bad code\n\nConsole:\n(empty)");
  });
});
