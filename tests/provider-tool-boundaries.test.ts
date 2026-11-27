import { describe, expect, it } from "vitest";
import { collectToolRound } from "../src/provider-tool-collector";
import { anthropicToolFields, geminiToolFields, openAIToolFields } from "../src/provider-tool-encoding";
import { collectToolRound as legacyCollector, openAIToolFields as legacyEncoding } from "../src/provider-tools";
import type { ExecutionResult } from "../src/js-tool-runtime";

const result = (text: string): ExecutionResult => ({ status: "success", durationMs: 0, console: [], truncated: false, value: { format: "json", text } });

describe("provider tool encoding and collection boundaries", () => {
  it("reorders fragmented OpenAI calls by index and pairs results across encoders", () => {
    const collector = collectToolRound();
    collector.openAI([{ index: 1, id: "second", function: { name: "calculate", arguments: '{"value":' } }, { index: 0, id: "first", function: { name: "calculate", arguments: '{}' } }]);
    collector.openAI([{ index: 1, function: { arguments: '2}' } }]);
    const round = collector.finish("text")!;
    expect(round.calls.map((call) => call.id)).toEqual(["first", "second"]);
    expect(round.calls[1].arguments).toBe('{"value":2}');
    const request = { allowCalls: true, exchanges: [{ round, results: [result("one"), result("two")] }] };
    expect(openAIToolFields(request, false).tail.slice(1)).toEqual([
      { role: "tool", tool_call_id: "first", content: JSON.stringify(result("one")) },
      { role: "tool", tool_call_id: "second", content: JSON.stringify(result("two")) },
    ]);
    expect(anthropicToolFields(request).tail[1]).toEqual({ role: "user", content: [
      { type: "tool_result", tool_use_id: "first", content: JSON.stringify(result("one")) },
      { type: "tool_result", tool_use_id: "second", content: JSON.stringify(result("two")) },
    ] });
  });
  it("preserves Gemini call signatures and maps responses in call order", () => {
    const collector = collectToolRound();
    collector.gemini([{ functionCall: { id: "a", name: "calculate", args: {} }, thoughtSignature: "signature" }, { functionCall: { id: "b", name: "calculate", args: {} } }]);
    const round = collector.finish("")!;
    const tail = geminiToolFields({ allowCalls: false, exchanges: [{ round, results: [result("one"), result("two")] }] }).tail;
    expect(tail[0]).toMatchObject({ parts: [{ thoughtSignature: "signature" }, {}] });
    expect(tail[1]).toEqual({ role: "user", parts: [
      { functionResponse: { id: "a", name: "calculate", response: result("one") } },
      { functionResponse: { id: "b", name: "calculate", response: result("two") } },
    ] });
  });
  it("rejects duplicate call IDs and retains compatibility exports", () => {
    const collector = collectToolRound();
    collector.openAI([{ index: 0, id: "same", function: { name: "a" } }, { index: 1, id: "same", function: { name: "b" } }]);
    expect(() => collector.finish("")).toThrow(/invalid or oversized/);
    expect(legacyCollector).toBe(collectToolRound);
    expect(legacyEncoding).toBe(openAIToolFields);
  });
});
