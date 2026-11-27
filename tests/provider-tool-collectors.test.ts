import { describe, expect, it } from "vitest";
import { collectToolRound } from "../src/provider-tool-collector";
import { maxToolReplayChars } from "../src/provider-tool-types";

describe("provider tool collectors", () => {
  it("reassembles interleaved Anthropic blocks in arrival order", () => {
    const collector = collectToolRound();
    collector.anthropic.start(7, "first", "calculate");
    collector.anthropic.start(2, "second", "text_tool");
    collector.anthropic.delta(2, '{"text":');
    collector.anthropic.delta(7, '{"value":1}');
    collector.anthropic.delta(2, '"hello"}');
    collector.anthropic.delta(99, "ignored");
    expect(collector.finish("")?.calls).toEqual([
      { id: "first", name: "calculate", arguments: '{"value":1}' },
      { id: "second", name: "text_tool", arguments: '{"text":"hello"}' },
    ]);
  });
  it("keeps Gemini signatures and generated IDs on a completed turn", () => {
    const collector = collectToolRound();
    collector.gemini([{ thought: true, text: "thinking", thoughtSignature: "signed" }, { functionCall: { name: "calculate", args: { expression: "1+1" } } }]);
    expect(collector.finish("answer")).toMatchObject({ calls: [{ id: "gemini-0", name: "calculate", arguments: '{"expression":"1+1"}' }], geminiParts: [{ thought: true, text: "thinking", thoughtSignature: "signed" }, { functionCall: { name: "calculate", args: { expression: "1+1" } } }] });
  });
  it("enforces the shared replay budget across collectors before returning calls", () => {
    const collector = collectToolRound();
    collector.openAI(undefined, [{ text: "x".repeat(maxToolReplayChars) }]);
    collector.gemini([{ functionCall: { name: "calculate", args: {} } }]);
    expect(() => collector.finish("")).toThrow(/invalid or oversized/);
  });
  it("rejects conflicting IDs in split OpenAI-compatible fragments", () => {
    const collector = collectToolRound();
    collector.openAI([{ index: 0, id: "first", function: { name: "calculate" } }]);
    expect(() => collector.openAI([{ index: 0, id: "other" }])).toThrow(/invalid or oversized/);
  });
});
