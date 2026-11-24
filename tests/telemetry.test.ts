import { describe, expect, it } from "vitest";
import { normalizeResponseSample } from "../src/provider-telemetry";
import {
  createResponseTracker,
  openRouterTokenPricing,
  responseIdentity,
  responseTps,
  validResponseTelemetry,
} from "../src/response-telemetry";
import { buildRequest } from "../src/providers";
import { validBackup } from "../src/data-contracts";
import { defaultSettings } from "../src/types";
import type { Message } from "../src/types";

const messages: Message[] = [
  { id: "user", role: "user", content: "Question", createdAt: 1 },
];

describe("response telemetry normalization", () => {
  it("keeps usage and cost from trailing OpenRouter usage-only events", () => {
    const sample = normalizeResponseSample("openrouter", {
      model: "vendor/model",
      choices: [],
      reasoning_effort: "high",
      usage: {
        prompt_tokens: 80,
        completion_tokens: 20,
        total_tokens: 100,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 8 },
        cost: 0.0012,
      },
    });
    expect(sample).toMatchObject({
      generated: false,
      servedModel: "vendor/model",
      reasoningEffort: "high",
      usage: { input: 80, output: 20, total: 100, cached: 0, reasoning: 8 },
      costUsd: 0.0012,
    });
    expect(
      normalizeResponseSample("openai", {
        usage: { cost: 1, completion_tokens: 20 },
      }).costUsd,
    ).toBeUndefined();
    expect(
      normalizeResponseSample("lmstudio", { usage: { completion_tokens: 20 } })
        .usage?.output,
    ).toBe(20);
  });

  it("preserves Gemini's separately reported answer, reasoning and total counts", () => {
    const sample = normalizeResponseSample("gemini", {
      modelVersion: "gemini-stable",
      candidates: [
        {
          content: { parts: [{ text: "Thought", thought: true }] },
          finishReason: "MAX_TOKENS",
        },
      ],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 10,
        thoughtsTokenCount: 12,
        cachedContentTokenCount: 35,
        totalTokenCount: 122,
      },
    });
    expect(sample).toMatchObject({
      generated: true,
      servedModel: "gemini-stable",
      finishReason: "MAX_TOKENS",
      usage: { input: 100, output: 10, reasoning: 12, cached: 35, total: 122 },
    });
  });

  it("does not count role, finish, or text events as tokens or accept invalid counts", () => {
    expect(
      normalizeResponseSample("openai", {
        choices: [{ delta: { role: "assistant" } }],
      }).generated,
    ).toBe(false);
    expect(
      normalizeResponseSample("openai", {
        choices: [{ finish_reason: "stop" }],
      }),
    ).toMatchObject({ generated: false, finishReason: "stop" });
    const sample = normalizeResponseSample("lmstudio", {
      choices: [{ delta: { content: "Partial text" } }],
      usage: { prompt_tokens: "10", completion_tokens: 3.5, total_tokens: -1 },
    });
    expect(sample.generated).toBe(true);
    expect(sample.usage).toEqual({
      input: undefined,
      output: undefined,
      total: undefined,
      reasoning: undefined,
      cached: undefined,
    });
  });

  it("requests usage only where supported and does not include telemetry in chat requests", () => {
    const response: Message = {
      id: "assistant",
      role: "assistant",
      content: "Answer",
      createdAt: 1,
      status: "complete",
      telemetry: {
        provider: "openrouter",
        model: "old-model",
        finishReason: "sensitive-test-marker",
      },
    };
    const target = defaultSettings.providers;
    expect(buildRequest(target.openai, messages).body).toMatchObject({
      stream_options: { include_usage: true },
    });
    expect(buildRequest(target.openrouter, messages).body).toMatchObject({
      usage: { include: true },
    });
    expect(buildRequest(target.lmstudio, messages).body).not.toHaveProperty(
      "stream_options",
    );
    expect(buildRequest(target.gemini, messages).body).not.toHaveProperty(
      "usage",
    );
    for (const config of Object.values(target)) {
      const body = JSON.stringify(
        buildRequest(config, [...messages, response]).body,
      );
      expect(body).not.toContain("sensitive-test-marker");
    }
  });
});

describe("response timing and pricing", () => {
  it("uses a monotonic clock, measures text separately, and computes TPS only from usage", () => {
    let now = 100;
    const tracker = createResponseTracker(
      responseIdentity({
        ...defaultSettings.providers.lmstudio,
        model: "local",
      }),
      undefined,
      () => now,
    );
    now = 130;
    tracker.receive({ generated: true });
    tracker.visible(" \n");
    expect(tracker.snapshot().ttftMs).toBe(30);
    expect(tracker.snapshot().ttfvMs).toBeUndefined();
    now = 230;
    tracker.receive({ generated: true }, 130); // Another event in the same read.
    expect(
      responseTps({ ...tracker.snapshot(), usage: { output: 40 } }),
    ).toBeUndefined();
    tracker.receive({ generated: true }, 230);
    tracker.visible("Answer");
    expect(responseTps(tracker.snapshot())).toBeUndefined();
    const interim = tracker.snapshot();
    now = 630;
    tracker.receive({ usage: { output: 40 } });
    tracker.receive({ usage: { input: 50, total: 90 }, finishReason: "stop" });
    const final = tracker.snapshot();
    expect(interim.usage).toBeUndefined();
    expect(final).toMatchObject({
      ttftMs: 30,
      ttfvMs: 130,
      lastGeneratedMs: 130,
      durationMs: 530,
      usage: { output: 40, input: 50, total: 90 },
      finishReason: "stop",
    });
    expect(responseTps(final)).toBe(400);
  });

  it("estimates only compatible catalog rates and prefers a reported zero cost", () => {
    const identity = responseIdentity({
      ...defaultSettings.providers.openrouter,
      model: "vendor/model",
    });
    const pricing = openRouterTokenPricing({
      prompt: "0.001",
      completion: "0.002",
      input_cache_read: "0.0005",
      request: "0",
    });
    const tracker = createResponseTracker(identity, pricing, () => 0);
    tracker.receive({ usage: { input: 10, output: 5 } });
    expect(tracker.snapshot().cost).toBeUndefined();
    tracker.receive({ usage: { cached: 4 } });
    expect(tracker.snapshot().cost?.usd).toBeCloseTo(0.018);
    expect(tracker.snapshot().cost?.source).toBe("estimated");
    tracker.receive({ servedModel: "vendor/another" });
    expect(tracker.snapshot().cost).toBeUndefined();
    tracker.receive({ costUsd: 0 });
    expect(tracker.snapshot().cost).toEqual({ usd: 0, source: "reported" });
    expect(
      openRouterTokenPricing({ prompt: "-1", completion: "0" }),
    ).toBeUndefined();
    expect(
      openRouterTokenPricing({
        prompt: "0",
        completion: "0",
        input_cache_write: "0.001",
      }),
    ).toBeUndefined();
  });

  it("accepts both new and legacy backups but rejects malformed telemetry", () => {
    const assistant: Message = {
      id: "reply",
      role: "assistant",
      content: "Answer",
      createdAt: 1,
    };
    const backup = (reply: Message) => ({
      version: 1,
      conversations: [
        {
          id: "chat",
          title: "Chat",
          draft: "",
          updatedAt: 1,
          messages: [reply],
        },
      ],
    });
    expect(validBackup(backup(assistant))).toBe(true);
    const telemetry = {
      provider: "gemini",
      model: "gemini-stable",
      durationMs: 100,
      usage: { reasoning: 0 },
    } as const;
    expect(validBackup(backup({ ...assistant, telemetry }))).toBe(true);
    expect(
      validResponseTelemetry({
        ...telemetry,
        cost: { source: "estimated", usd: -1 },
      }),
    ).toBe(false);
    expect(
      validBackup(
        backup({
          ...assistant,
          telemetry: { ...telemetry, usage: { input: -4 } },
        }),
      ),
    ).toBe(false);
  });
});
