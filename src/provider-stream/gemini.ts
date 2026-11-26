import type { StreamContext, StreamDecoder } from "./types";

export function createGeminiDecoder({ emitText, onReasoning, collector }: StreamContext): StreamDecoder {
  return {
    push(chunk) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        collector?.gemini(parts);
        for (const part of parts) {
          if (typeof part?.text !== "string" || !part.text) continue;
          if (part.thought === true) onReasoning(part.text);
          else emitText(part.text);
        }
      }
      return false;
    },
  };
}
