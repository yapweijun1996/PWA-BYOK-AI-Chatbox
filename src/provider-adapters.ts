import { effortFor } from "./reasoning-effort";
import { buildResponsesRequest } from "./responses-request";
import { replay } from "./responses-replay";
import { streamResponsesPrototype } from "./responses-stream";
import type { OutputItem } from "./responses-types";
import type { Message, ProviderConfig, ProviderId } from "./types";
import { buildRequest } from "./provider-request";
import { consumeProviderStream } from "./provider-stream";
import { parseModelOptions, type ModelOption } from "./model-options";
import type { ResponseSample } from "./response-telemetry";
import type { ToolRequest, ToolRound } from "./provider-tools";

/** The shared network boundary preserves provider-specific authentication and error policy. */
export type ProviderTransport = (config: ProviderConfig, path: string, secret: string, init?: RequestInit) => Promise<Response>;
export type ProviderStreamInput = {
  config: ProviderConfig;
  secret: string;
  messages: Message[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onSample?: (sample: ResponseSample, receivedAt: number) => void;
  tool?: ToolRequest;
  onResponsesOutput?: (items: OutputItem[]) => void;
};
export interface ProviderAdapter {
  readonly id: ProviderId;
  listModels(config: ProviderConfig, secret: string, signal?: AbortSignal): Promise<ModelOption[]>;
  stream(input: ProviderStreamInput): Promise<ToolRound | undefined>;
}

async function discoverModels(request: ProviderTransport, config: ProviderConfig, secret: string, signal?: AbortSignal): Promise<ModelOption[]> {
  const response = await request(config, "/models", secret, { signal });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Provider returned an invalid model list.");
  }
  if (!data || typeof data !== "object")
    throw new Error("Provider returned an invalid model list.");
  return parseModelOptions(config.id, data);
}

async function streamReply(request: ProviderTransport, responsesMode: boolean, input: ProviderStreamInput): Promise<ToolRound | undefined> {
  const { config, secret, messages, signal, onText, onReasoning, onSample, tool, onResponsesOutput } = input;
  if (!config.model.trim())
    throw new Error("Choose or enter a model in Providers.");
  if (config.id !== "lmstudio" && !secret)
    throw new Error("Enter an API key in Providers.");
  if (
    !config.vision &&
    messages.some((m) =>
      m.attachments?.some((a) => a.mime.startsWith("image/")),
    )
  )
    throw new Error(
      "Enable image support for this model in Providers before sending images.",
    );
  if (responsesMode && config.openaiApi === "responses") {
    const body = buildResponsesRequest(config.model, messages, tool ? {
      allowCalls: tool.allowCalls,
      exchanges: tool.exchanges.map(({ round, results }) => {
        if (!round.responsesItems) throw new Error("Missing Responses tool transcript.");
        return { items: round.responsesItems, results };
      }),
      requestSummary: config.requestThoughts,
    } : undefined, config.requestThoughts, effortFor(config.id, config.reasoningEffort));
    const result = await streamResponsesPrototype(
      (payload, requestSignal) => request(config, "/responses", secret, { method: "POST", body: JSON.stringify(payload), signal: requestSignal }),
      body, signal, onText, onReasoning,
    );
    // Reject malformed replay items before allowing any requested local tool to run.
    replay(result.output, result.calls.map(() => ({} as import("./js-tool-runtime").ExecutionResult)));
    const usage = result.usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } } | undefined;
    if (usage) onSample?.({ usage: { input: usage.input_tokens, output: usage.output_tokens, total: usage.total_tokens, cached: usage.input_tokens_details?.cached_tokens, reasoning: usage.output_tokens_details?.reasoning_tokens } }, performance.now());
    onResponsesOutput?.(result.output);
    if (!result.calls.length) return undefined;
    if (!tool || !tool.allowCalls) throw new Error("The model requested tools when tools were disabled.");
    return { calls: result.calls, text: "", geminiParts: [], reasoningDetails: [], responsesItems: result.output };
  }
  const { path, body } = buildRequest(config, messages, tool);
  const response = await request(config, path, secret, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (!response.body)
    throw new Error("The provider returned an empty response.");
  return consumeProviderStream({
    provider: config.id, stream: response.body, signal, onText, onReasoning, onSample, tool,
  });
}

/** A transport is supplied once; secrets and abort signals remain request-scoped. */
export function createProviderAdapters(request: ProviderTransport): Readonly<Record<ProviderId, ProviderAdapter>> {
  const create = (id: ProviderId, responsesMode = false): ProviderAdapter => ({
    id,
    listModels(config, secret, signal) {
      if (config.id !== id) return Promise.reject(new Error("Provider configuration does not match adapter."));
      return discoverModels(request, config, secret, signal);
    },
    stream(input) {
      if (input.config.id !== id) return Promise.reject(new Error("Provider configuration does not match adapter."));
      return streamReply(request, responsesMode, input);
    },
  });
  return {
    gemini: create("gemini"),
    openai: create("openai", true),
    anthropic: create("anthropic"),
    openrouter: create("openrouter"),
    lmstudio: create("lmstudio"),
  };
}
