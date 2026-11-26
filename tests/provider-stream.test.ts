import { describe, expect, it } from "vitest";
import { consumeProviderStream } from "../src/provider-stream";
import type { ProviderId } from "../src/types";
import type { ResponseSample } from "../src/response-telemetry";

function stream(...events: Array<object | string>): ReadableStream<Uint8Array> {
  const body = events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join("");
  const bytes = new TextEncoder().encode(body);
  // Split through JSON and delimiter boundaries, as real network reads can.
  const parts = [bytes.slice(0, 7), bytes.slice(7, 19), bytes.slice(19)];
  return new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } });
}
function run(provider: ProviderId, ...events: Array<object | string>) {
  const output = { text: "", reasoning: "", samples: [] as ResponseSample[] };
  const result = consumeProviderStream({ provider, stream: stream(...events), signal: new AbortController().signal,
    onText: (text) => { output.text += text; }, onReasoning: (text) => { output.reasoning += text; },
    onSample: (sample) => { output.samples.push(sample); }, tool: { allowCalls: true, exchanges: [] },
  });
  return { output, result };
}

describe("provider stream decoders", () => {
  it("reassembles Anthropic text, reasoning and split tool arguments", async () => {
    const { output, result } = run("anthropic",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "Hello" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Thinking" } },
      { type: "content_block_start", index: 4, content_block: { type: "tool_use", id: "call-1", name: "text_tool" } },
      { type: "content_block_delta", index: 4, delta: { type: "input_json_delta", partial_json: '{"text":' } },
      { type: "content_block_delta", index: 4, delta: { type: "input_json_delta", partial_json: '"abc"}' } },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 4 } },
      { type: "message_stop" },
    );
    const round = await result;
    expect(output.text).toBe("Hello"); expect(output.reasoning).toBe("Thinking");
    expect(round?.calls).toEqual([{ id: "call-1", name: "text_tool", arguments: '{"text":"abc"}' }]);
    expect(output.samples.some((sample) => sample.usage?.output === 4)).toBe(true);
  });
  it("keeps Gemini thought signatures and function calls", async () => {
    const { output, result } = run("gemini", { candidates: [{ content: { parts: [
      { thought: true, text: "Consider", thoughtSignature: "signature" },
      { text: "Answer" }, { functionCall: { name: "text_tool", args: { action: "sort", text: "b\na" } } },
    ] }, finishReason: "STOP" }], usageMetadata: { totalTokenCount: 12 } });
    const round = await result;
    expect(output.text).toBe("Answer"); expect(output.reasoning).toBe("Consider");
    expect(round?.calls[0]).toMatchObject({ name: "text_tool", arguments: '{"action":"sort","text":"b\\na"}' });
    expect(round?.geminiParts[0]).toMatchObject({ thought: true, thoughtSignature: "signature" });
    expect(output.samples[0].usage?.total).toBe(12);
  });
  it("keeps OpenRouter reasoning details and trailing usage", async () => {
    const { output, result } = run("openrouter",
      { choices: [{ delta: { reasoning_details: [{ type: "reasoning.summary", summary: "Plan" }], content: "Result" }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }, "[DONE]",
    );
    expect(await result).toBeUndefined();
    expect(output).toMatchObject({ text: "Result", reasoning: "Plan" });
    expect(output.samples.at(-1)?.usage?.total).toBe(5);
  });
  it("routes LM Studio think tags split across chunks", async () => {
    const { output, result } = run("lmstudio",
      { choices: [{ delta: { content: "<thi" } }] }, { choices: [{ delta: { content: "nk>Plan</thi" } }] },
      { choices: [{ delta: { content: "nk>Answer" }, finish_reason: "stop" }] }, "[DONE]",
    );
    await result; expect(output.reasoning).toBe("Plan"); expect(output.text).toBe("Answer");
  });
  it("retains partial text on malformed data and output-limit errors", async () => {
    const malformed = run("openai", { choices: [{ delta: { content: "partial" } }] }, "not-json");
    await expect(malformed.result).rejects.toThrow(/invalid streaming data/); expect(malformed.output.text).toBe("partial");
    const limited = run("openai", { choices: [{ delta: { content: "partial" }, finish_reason: "length" }] }, { choices: [], usage: { total_tokens: 9 } });
    await expect(limited.result).rejects.toThrow(/output limit/); expect(limited.output.text).toBe("partial");
    expect(limited.output.samples.at(-1)?.usage?.total).toBe(9);
  });
  it("rejects interrupted, blocked and malformed tool responses", async () => {
    const interrupted = run("openai", { choices: [{ delta: { content: "partial" } }] });
    await expect(interrupted.result).rejects.toThrow(/interrupted before completion/);
    const blocked = run("gemini", { candidates: [{ content: { parts: [{ text: "partial" }] }, finishReason: "SAFETY" }] });
    await expect(blocked.result).rejects.toThrow(/content policy/);
    const malformedTool = run("openai", { choices: [{ delta: { tool_calls: [{ index: 0, id: "call", function: { name: "", arguments: "{}" } }] }, finish_reason: "tool_calls" }] });
    await expect(malformedTool.result).rejects.toThrow(/invalid or oversized tool call/);
  });
});
