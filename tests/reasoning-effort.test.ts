import { describe, expect, it } from "vitest";
import { buildRequest } from "../src/providers";
import { buildResponsesRequest } from "../src/openai-responses";
import { mergeSettings, backupPreferences } from "../src/data-contracts";
import { captureRequest, profileOverride, resolveConfig, validOverrides, validRequestSnapshot } from "../src/request-config";
import { configureModel } from "../src/model-options";
import { defaultSettings } from "../src/types";
import type { ProviderConfig } from "../src/types";

const config = (id: ProviderConfig["id"]): ProviderConfig => ({ ...defaultSettings.providers[id], model: "model-a", reasoningEffort: "high" });
describe("model-specific reasoning effort", () => {
  it("maps explicit effort to each provider's request without changing default requests", () => {
    expect(buildRequest(config("openai"), []).body).toMatchObject({ reasoning_effort: "high" });
    expect(buildResponsesRequest("gpt-6-luna", [], undefined, true, "high")).toMatchObject({ reasoning: { effort: "high", summary: "auto" } });
    expect(buildRequest(config("openrouter"), []).body).toMatchObject({ reasoning: { effort: "high" } });
    expect(buildRequest(config("lmstudio"), []).body).toMatchObject({ reasoning_effort: "high" });
    expect(buildRequest(config("gemini"), []).body).toMatchObject({ generationConfig: { thinkingConfig: { thinkingLevel: "HIGH" } } });
    expect(buildRequest(config("anthropic"), []).body).toMatchObject({ output_config: { effort: "high" } });
    expect(buildRequest({ ...config("openai"), reasoningEffort: "default" }, []).body).not.toHaveProperty("reasoning_effort");
    expect(buildRequest({ ...config("openai"), model: "gpt-6-luna" }, [], { allowCalls: true, exchanges: [] }).body).toHaveProperty("reasoning_effort", "none");
  });
  it("persists independent model values and captures the original level for retry", () => {
    const settings = mergeSettings({ ...defaultSettings, provider: "openai", providers: { ...defaultSettings.providers, openai: { ...config("openai"), reasoningEfforts: { "model-a": "high", "model-b": "low" } } } });
    const restored = mergeSettings(backupPreferences(settings).preferences);
    expect(resolveConfig(restored).config.reasoningEffort).toBe("high");
    const switched = configureModel(restored.providers.openai, { id: "model-b" });
    expect(switched.reasoningEffort).toBe("low");
    const snapshot = captureRequest(resolveConfig(restored));
    expect(validRequestSnapshot(snapshot)).toBe(true);
    const retry = profileOverride({ ...snapshot, id: snapshot.provider });
    expect(validOverrides(retry)).toBe(true);
    expect(resolveConfig({ ...restored, providers: { ...restored.providers, openai: switched } }, undefined, retry).config.reasoningEffort).toBe("high");
    expect(resolveConfig(restored, { provider: "openai", model: "model-b" }).config.reasoningEffort).toBe("low");
  });
  it("drops malformed or unsupported saved values", () => {
    const saved = mergeSettings({ ...defaultSettings, providers: { ...defaultSettings.providers, anthropic: { ...config("anthropic"), reasoningEfforts: { "model-a": "none" } } } });
    expect(saved.providers.anthropic.reasoningEfforts).toBeUndefined();
    expect(validOverrides({ provider: "openai", reasoningEffort: "unexpected" })).toBe(false);
  });
});
