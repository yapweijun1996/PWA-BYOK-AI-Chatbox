import { describe, expect, it } from "vitest";
import {
  compactModelName,
  configureModel,
  parseModelOptions,
} from "../src/model-options";
import { mergeSettings } from "../src/data-contracts";
import { defaultSettings } from "../src/types";

describe("composer model capabilities", () => {
  it("only exposes recognized catalog capabilities and keeps the full ID", () => {
    const options = parseModelOptions("openrouter", {
      data: [
        { id: "vendor/fast", supported_parameters: ["tools"] },
        {
          id: "vendor/vision",
          name: "Vision",
          architecture: { input_modalities: ["text", "image"] },
          supported_parameters: ["reasoning"],
        },
        { id: "vendor/vision" },
        { id: 42 },
        null,
      ],
    });
    expect(options).toEqual([
      { id: "vendor/fast", name: undefined },
      { id: "vendor/vision", name: "Vision", vision: true, reasoning: true },
    ]);
    expect(compactModelName(options[0])).toBe("fast");
    expect(compactModelName(options[1])).toBe("Vision");
    expect(
      parseModelOptions("lmstudio", {
        data: [{ id: "local", supported_parameters: ["reasoning"] }],
      })[0].reasoning,
    ).toBeUndefined();
  });

  it("only uses the advertised Gemini thinking metadata for chat models", () => {
    const options = parseModelOptions("gemini", {
      models: [
        {
          name: "models/embedding",
          thinking: true,
          supportedGenerationMethods: ["embedContent"],
        },
        {
          name: "models/gemini-thinking",
          displayName: "Gemini Thinking",
          thinking: true,
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/gemini-other",
          thinking: "true",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    });
    expect(options).toEqual([
      { id: "gemini-thinking", name: "Gemini Thinking", reasoning: true },
      { id: "gemini-other", name: undefined },
    ]);
  });

  it("does not carry options across model IDs and restores explicit support from settings", () => {
    const old = {
      ...defaultSettings.providers.openrouter,
      model: "vendor/vision",
      vision: true,
      requestThoughts: true,
    };
    expect(configureModel(old, { id: old.model })).toBe(old);
    expect(configureModel(old, { id: "vendor/unknown" })).toMatchObject({
      vision: false,
      requestThoughts: false,
      reasoningSupported: false,
    });
    const next = configureModel(old, {
      id: "vendor/other",
      vision: true,
      reasoning: true,
    });
    const stored = mergeSettings({
      providers: { ...defaultSettings.providers, openrouter: next },
    });
    expect(stored.providers.openrouter).toMatchObject({
      vision: true,
      reasoningSupported: true,
      requestThoughts: false,
    });
  });
});
