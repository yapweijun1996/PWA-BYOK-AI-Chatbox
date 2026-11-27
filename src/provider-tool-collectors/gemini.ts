import { toolTurnLimits, type ToolCall } from "../javascript-tool";
import { maxToolReplayChars, type GeminiPart } from "../provider-tool-types";
import { malformed, maxArguments, record, string, type ContextBudget } from "./shared";

export function createGeminiToolCollector(budget: ContextBudget) {
  const geminiParts: GeminiPart[] = [];
  const geminiCalls: ToolCall[] = [];
  return {
    push(parts: unknown[]) {
      for (const input of parts) {
        const part = record(input);
        if (!part) continue;
        const sig = string(part.thoughtSignature);
        const text = string(part.text);
        if (
          !budget.absorb(sig.length + text.length + 1) &&
          part.functionCall === undefined
        )
          continue;
        const signature = sig ? { thoughtSignature: sig } : {};
        if (part.functionCall !== undefined) {
          const fn = record(part.functionCall);
          const id = string(fn?.id);
          const name = string(fn?.name);
          const args = record(fn?.args) ?? {};
          const json = JSON.stringify(args);
          if (
            !name ||
            name.length > 64 ||
            id.length > 160 ||
            json.length > maxArguments ||
            sig.length > maxToolReplayChars ||
            geminiCalls.length >= toolTurnLimits.calls
          )
            throw malformed();
          geminiCalls.push({
            id: id || `gemini-${geminiCalls.length}`,
            name,
            arguments: json,
          });
          geminiParts.push({
            functionCall: { ...(id ? { id } : {}), name, args },
            ...signature,
          });
        } else if (text || sig) {
          const previous = geminiParts.at(-1);
          if (
            text &&
            !sig &&
            part.thought !== true &&
            previous?.text &&
            !previous.thoughtSignature &&
            !previous.thought
          )
            previous.text += text;
          else if (geminiParts.length < 512)
            geminiParts.push({
              ...(text || sig ? { text } : {}),
              ...(part.thought === true ? { thought: true } : {}),
              ...signature,
            });
          else budget.reject();
        }
      }
    },
    calls: geminiCalls,
    parts: geminiParts,
  };
}
