import { maxToolReplayChars, type ToolRound } from "./provider-tool-types";
import { createContextBudget, malformed } from "./provider-tool-collectors/shared";
import { createOpenAIToolCollector } from "./provider-tool-collectors/openai-compatible";
import { createGeminiToolCollector } from "./provider-tool-collectors/gemini";
import { createAnthropicToolCollector } from "./provider-tool-collectors/anthropic";

/** Coordinates shared limits and final validation across provider collectors. */
export function collectToolRound() {
  const budget = createContextBudget();
  const openai = createOpenAIToolCollector(budget);
  const gemini = createGeminiToolCollector(budget);
  const anthropic = createAnthropicToolCollector(openai);
  return {
    openAI: openai.push,
    gemini: gemini.push,
    anthropic,
    finish(text: string): ToolRound | undefined {
      const calls = gemini.calls.length ? gemini.calls : openai.calls();
      if (!calls.length) return;
      if (budget.exceeded() || text.length > maxToolReplayChars || calls.some(({ id, name }) => !id || !name) || new Set(calls.map(({ id }) => id)).size !== calls.length)
        throw malformed();
      return { calls, text, geminiParts: gemini.parts, reasoningDetails: openai.reasoningDetails };
    },
  };
}
