import { describe, expect, it } from "vitest";
import { anthropicToolFields } from "../src/provider-tool-encoders/anthropic";
import { geminiToolFields } from "../src/provider-tool-encoders/gemini";
import { openAIToolFields } from "../src/provider-tool-encoders/openai-compatible";
import { responsesTools } from "../src/provider-tool-encoders/responses";
import * as legacy from "../src/provider-tool-encoding";

const expectedNames = ["javascript_execute", "time_tool", "calculate", "analyze_file", "text_tool", "memory_tool"];
describe("provider tool encoders", () => {
  it("exposes the same tools in each provider's native declaration format", () => {
    const request = { allowCalls: true, exchanges: [] };
    const anthropic = anthropicToolFields(request).options.tools!;
    const gemini = geminiToolFields(request).options.tools![0].functionDeclarations;
    const openai = openAIToolFields(request, false).options.tools!;
    expect(anthropic.map((tool) => tool.name)).toEqual(expectedNames);
    expect(gemini.map((tool) => tool.name)).toEqual(expectedNames);
    expect(openai.map((tool) => tool.function.name)).toEqual(expectedNames);
    expect(responsesTools.map((tool) => tool.name)).toEqual(expectedNames);
    expect(anthropic[0].input_schema).toEqual(gemini[0].parameters);
    expect(openai[0].function.parameters).toEqual(gemini[0].parameters);
    expect(responsesTools[0]).toMatchObject({ type: "function", strict: false, parameters: gemini[0].parameters });
  });
  it("keeps disabled choice, absent requests and legacy exports", () => {
    const request = { allowCalls: false, exchanges: [] };
    expect(anthropicToolFields(request).options.tool_choice).toEqual({ type: "none" });
    expect(geminiToolFields(request).options.toolConfig).toEqual({ functionCallingConfig: { mode: "NONE" } });
    expect(openAIToolFields(request, true).options.tool_choice).toBe("none");
    expect(anthropicToolFields(undefined)).toEqual({ options: {}, tail: [] });
    expect(geminiToolFields(undefined)).toEqual({ options: {}, tail: [] });
    expect(openAIToolFields(undefined, false)).toEqual({ options: {}, tail: [] });
    expect(legacy.anthropicToolFields).toBe(anthropicToolFields);
    expect(legacy.geminiToolFields).toBe(geminiToolFields);
    expect(legacy.openAIToolFields).toBe(openAIToolFields);
  });
});
