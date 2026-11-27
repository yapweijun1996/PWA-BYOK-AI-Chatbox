import { parseEventStream } from "../event-stream";
import { normalizeResponseSample } from "../provider-telemetry";
import { collectToolRound } from "../provider-tool-collector";
import { maxToolReplayChars, type ToolRequest, type ToolRound } from "../provider-tool-types";
import type { ResponseSample } from "../response-telemetry";
import type { ProviderId } from "../types";
import { createAnthropicDecoder } from "./anthropic";
import { createGeminiDecoder } from "./gemini";
import { createOpenAICompatibleDecoder } from "./openai-compatible";
import type { StreamContext, StreamDecoder, StreamChunk } from "./types";

export type ProviderStreamOptions = {
  provider: ProviderId;
  stream: ReadableStream<Uint8Array>;
  signal: AbortSignal;
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onSample?: (sample: ResponseSample, receivedAt: number) => void;
  tool?: ToolRequest;
};

type DecoderFactory = (context: StreamContext) => StreamDecoder;
const decoders: Record<ProviderId, DecoderFactory> = {
  anthropic: createAnthropicDecoder,
  gemini: createGeminiDecoder,
  openai: (context) => createOpenAICompatibleDecoder("openai", context),
  openrouter: (context) => createOpenAICompatibleDecoder("openrouter", context),
  lmstudio: (context) => createOpenAICompatibleDecoder("lmstudio", context),
};

/** Consume provider events while preserving partial output, completion and tool limits. */
export async function consumeProviderStream({ provider, stream, signal, onText, onReasoning, onSample, tool }: ProviderStreamOptions): Promise<ToolRound | undefined> {
  let received = false, finished = false;
  let finishError: string | undefined;
  const collector = tool && collectToolRound();
  let roundText = "";
  const emitText = (text: string) => {
    if (!text) return;
    received = true;
    if (collector && roundText.length <= maxToolReplayChars)
      roundText += text.slice(0, maxToolReplayChars + 1 - roundText.length);
    onText(text);
  };
  const decoder = decoders[provider]({ emitText, onReasoning, collector });
  try {
    await parseEventStream(stream, (data, receivedAt) => {
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data);
        if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) throw new Error("Invalid stream payload");
      } catch {
        throw new Error("The provider returned invalid streaming data. Partial output was retained.");
      }
      const sample = normalizeResponseSample(provider, chunk);
      onSample?.(sample, receivedAt);
      if (chunk.error) throw new Error("The provider reported an error while generating.");
      if (decoder.push(chunk)) finished = true;
      const finishReason = sample.finishReason;
      // Usage can follow the terminating choice, including on truncation.
      if (finishReason === "error") finishError = "The provider reported an error while generating. Partial output was retained.";
      if (finishReason === "length" || finishReason === "MAX_TOKENS" || finishReason === "max_tokens")
        finishError = "The model reached its output limit. Partial output was retained.";
      if (finishReason === "content_filter" || finishReason === "SAFETY")
        finishError = "The provider stopped the response due to its content policy. Partial output was retained.";
      if (finishReason) finished = true;
    }, () => { finished = true; });
  } finally {
    decoder.flush?.();
  }
  signal.throwIfAborted();
  if (finishError) throw new Error(finishError);
  if (!finished) throw new Error("The response was interrupted before completion. Partial output was retained.");
  const round = collector?.finish(roundText);
  if (!received && !round) throw new Error("The provider returned no text. Check model compatibility or safety filters.");
  return round;
}
