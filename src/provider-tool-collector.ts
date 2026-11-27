import { toolTurnLimits, type ToolCall } from "./javascript-tool";
import { executionLimits } from "./js-tool-runtime/protocol";
import { maxToolReplayChars, type GeminiPart, type ToolRound } from "./provider-tool-types";

const maxArguments = executionLimits.sourceChars * 6 + 256;
const record = (input: unknown): Record<string, unknown> | undefined =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
const string = (input: unknown) => (typeof input === "string" ? input : "");
const malformed = () =>
  new Error(
    "The provider returned an invalid or oversized tool call. No code was executed for this round.",
  );

export function collectToolRound() {
  const openAI = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  const geminiParts: GeminiPart[] = [];
  const geminiCalls: ToolCall[] = [];
  const reasoningDetails: unknown[] = [];
  let contextChars = 0;
  let overflow = false;
  const absorb = (size: number) => {
    contextChars += size;
    overflow ||= contextChars > maxToolReplayChars;
    return !overflow;
  };
  return {
    openAI(calls: unknown, details?: unknown) {
      if (Array.isArray(details)) {
        for (const detail of details) {
          const size = JSON.stringify(detail)?.length ?? 0;
          if (absorb(size) && reasoningDetails.length < 128)
            reasoningDetails.push(detail);
          else overflow = true;
        }
      }
      if (!Array.isArray(calls)) return;
      for (const value of calls) {
        const call = record(value);
        const index = call?.index;
        if (
          typeof index !== "number" ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= toolTurnLimits.calls
        )
          throw malformed();
        if (call?.type !== undefined && call.type !== "function")
          throw malformed();
        const fn = record(call?.function);
        const pending = openAI.get(index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        const id = string(call?.id);
        if (id && pending.id && pending.id !== id) throw malformed();
        if (id) pending.id = id;
        pending.name += string(fn?.name);
        pending.arguments += string(fn?.arguments);
        if (
          pending.id.length > 160 ||
          pending.name.length > 64 ||
          pending.arguments.length > maxArguments
        )
          throw malformed();
        openAI.set(index, pending);
      }
    },
    gemini(parts: unknown[]) {
      for (const input of parts) {
        const part = record(input);
        if (!part) continue;
        const sig = string(part.thoughtSignature);
        const text = string(part.text);
        if (
          !absorb(sig.length + text.length + 1) &&
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
          else overflow = true;
        }
      }
    },
    finish(text: string): ToolRound | undefined {
      const calls = geminiCalls.length
        ? geminiCalls
        : [...openAI.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, call]) => ({
              ...call,
              arguments: call.arguments || "{}",
            }));
      if (!calls.length) return;
      if (
        overflow ||
        text.length > maxToolReplayChars ||
        calls.some(({ id, name }) => !id || !name) ||
        new Set(calls.map(({ id }) => id)).size !== calls.length
      )
        throw malformed();
      return { calls, text, geminiParts, reasoningDetails };
    },
  };
}
