import { describe, expect, it } from "vitest";
import { replay, validResponsesReplay } from "../src/responses-replay";
import { buildResponsesRequest } from "../src/responses-request";
import { replay as legacyReplay, buildResponsesRequest as legacyRequest } from "../src/openai-responses";
import type { ExecutionResult } from "../src/js-tool-runtime/protocol";

const call = (id: string) => ({ type: "function_call", call_id: id, name: "calculate", arguments: "{}" });
const result = (value: string): ExecutionResult => ({ status: "success", durationMs: 0, console: [], truncated: false, value: { format: "json", text: value } });

describe("Responses request and replay boundaries", () => {
  it("preserves tool call order and pairs each result with the right call", () => {
    expect(replay([call("first"), call("second")], [result("1"), result("2")])).toEqual([
      call("first"), call("second"),
      { type: "function_call_output", call_id: "first", output: JSON.stringify(result("1")) },
      { type: "function_call_output", call_id: "second", output: JSON.stringify(result("2")) },
    ]);
    expect(validResponsesReplay({ exchanges: [{ items: [call("first")], results: [] }], final: [] })).toBe(false);
  });

  it("rejects duplicate call ids across current exchanges and retains legacy exports", () => {
    const exchange = { items: [call("same")], results: [result("1")] };
    expect(() => buildResponsesRequest("model", [], { allowCalls: true, exchanges: [exchange, exchange] })).toThrow(/invalid or exceeds/);
    expect(legacyReplay).toBe(replay);
    expect(legacyRequest).toBe(buildResponsesRequest);
  });
});
