import { localThinkRouter } from "./local-think";
import type { ProviderId } from "../types";
import type { StreamContext, StreamDecoder } from "./types";

export function createOpenAICompatibleDecoder(provider: ProviderId, { emitText, onReasoning, collector }: StreamContext): StreamDecoder {
  const localTags = provider === "lmstudio" ? localThinkRouter(emitText, onReasoning) : undefined;
  return {
    push(chunk) {
      const delta = chunk.choices?.[0]?.delta;
      collector?.openAI(delta?.tool_calls, provider === "openrouter" ? delta?.reasoning_details : undefined);
      const reasoning = delta?.reasoning_content ?? delta?.reasoning;
      if (typeof reasoning === "string" && reasoning) onReasoning(reasoning);
      else if (provider === "openrouter" && Array.isArray(delta?.reasoning_details)) {
        for (const detail of delta.reasoning_details) {
          const text = detail?.type === "reasoning.text" ? detail.text : detail?.type === "reasoning.summary" ? detail.summary : undefined;
          if (typeof text === "string" && text) onReasoning(text);
        }
      }
      if (typeof delta?.content === "string" && delta.content) {
        if (localTags) localTags.push(delta.content);
        else emitText(delta.content);
      }
      return false;
    },
    flush: () => localTags?.flush(),
  };
}
