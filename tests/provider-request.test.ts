import { describe, expect, it } from "vitest";
import { buildRequest, providerRequestAdapters, requestHistory } from "../src/provider-request";
import { defaultSettings, providerIds, type Message } from "../src/types";

describe("provider request adapters", () => {
  it("provides a builder for each provider with the expected endpoint", () => {
    const paths = { anthropic: "/messages", gemini: "/models/example:streamGenerateContent?alt=sse", openai: "/chat/completions", openrouter: "/chat/completions", lmstudio: "/chat/completions" };
    for (const id of providerIds) {
      expect(typeof providerRequestAdapters[id]).toBe("function");
      expect(buildRequest({ ...defaultSettings.providers[id], model: "example" }, []).path).toBe(paths[id]);
    }
  });
  it("only replays completed assistant messages and keeps the latest consecutive answer", () => {
    const message = (id: string, role: Message["role"], status?: Message["status"]): Message => ({ id, role, content: id, createdAt: 0, status });
    expect(requestHistory([message("question", "user"), message("old", "assistant", "complete"), message("new", "assistant", "complete"), message("failed", "assistant", "error")]).map(({ id }) => id)).toEqual(["question", "new"]);
  });
});
