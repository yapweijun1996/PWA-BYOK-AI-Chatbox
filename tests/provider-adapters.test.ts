import { describe, expect, it, vi } from "vitest";
import { createProviderAdapters } from "../src/provider-adapters";
import { defaultSettings, providerIds, type ProviderId } from "../src/types";

const eventStream = (...events: object[]) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
const outputEvent = (id: ProviderId) => id === "anthropic"
  ? [{ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } }, { type: "message_stop" }]
  : id === "gemini"
    ? [{ candidates: [{ content: { parts: [{ text: "Hello" }] }, finishReason: "STOP" }] }]
    : [{ choices: [{ delta: { content: "Hello" }, finish_reason: "stop" }] }];

describe("provider adapter contract", () => {
  it.each(providerIds)("discovers and streams through the %s adapter", async (id) => {
    const config = { ...defaultSettings.providers[id], model: "test-model" };
    const signal = new AbortController().signal;
    const request = vi.fn(async (_config, path: string) => path === "/models"
      ? Response.json(id === "gemini" ? { models: [{ name: "models/test-model", supportedGenerationMethods: ["generateContent"] }] } : { data: [{ id: "test-model" }] })
      : eventStream(...outputEvent(id)));
    const adapter = createProviderAdapters(request)[id];
    expect(adapter.id).toBe(id);
    expect(await adapter.listModels(config, "secret", signal)).toEqual([expect.objectContaining({ id: "test-model" })]);
    let text = "";
    expect(await adapter.stream({ config, secret: "secret", messages: [{ id: "u", role: "user", content: "Hi", createdAt: 1 }], signal, onText: (part) => { text += part; }, onReasoning: () => {} })).toBeUndefined();
    expect(text).toBe("Hello");
    expect(request.mock.calls[0][0]).toEqual(config);
    expect(request.mock.calls[0][2]).toBe("secret");
    expect(request.mock.calls[0][3]).toEqual({ signal });
    expect(request.mock.calls[1][1]).toMatch(id === "anthropic" ? /^\/messages$/ : id === "gemini" ? /^\/models\/test-model:/ : /^\/chat\/completions$/);
  });
  it("routes Responses mode through the same contract", async () => {
    const request = vi.fn(async () => eventStream({ type: "response.output_text.delta", delta: "Hello" }, { type: "response.completed", response: { status: "completed", output: [] } }));
    const config = { ...defaultSettings.providers.openai, model: "test-model", openaiApi: "responses" as const };
    let text = "";
    await createProviderAdapters(request).openai.stream({ config, secret: "key", messages: [], signal: new AbortController().signal, onText: (part) => { text += part; }, onReasoning: () => {} });
    expect(text).toBe("Hello");
    expect(request.mock.calls[0][1]).toBe("/responses");
  });
  it("rejects a mismatched provider before using its credentials", async () => {
    const request = vi.fn();
    const adapters = createProviderAdapters(request);
    await expect(adapters.gemini.listModels(defaultSettings.providers.openai, "secret")).rejects.toThrow(/does not match/);
    expect(request).not.toHaveBeenCalled();
  });
});
