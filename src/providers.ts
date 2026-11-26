import { effortFor } from "./reasoning-effort";
import { responsesHttpHint } from "./responses-errors";
import { buildResponsesRequest } from "./responses-request";
import { replay } from "./responses-replay";
import { streamResponsesPrototype } from "./responses-stream";
import type { OutputItem } from "./responses-types";
import type { Message, ProviderConfig } from "./types";
import { providerBaseUrl } from "./provider-config";
import { buildRequest } from "./provider-request";
export { buildRequest, requestHistory, requiresLunaToolCompatibility } from "./provider-request";
import { consumeProviderStream } from "./provider-stream";
export { providerBaseUrl, requestsStreamUsage } from "./provider-config";
export { parseEventStream } from "./event-stream";
import { parseModelOptions } from "./model-options";
import type { ModelOption } from "./model-options";
import type { ResponseSample } from "./response-telemetry";
import type { ToolRequest, ToolRound } from "./provider-tools";
function headers(
  config: ProviderConfig,
  secret: string,
): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (config.id === "anthropic") {
    result["anthropic-version"] = "2023-06-01";
    result["anthropic-dangerous-direct-browser-access"] = "true";
    if (secret) result["x-api-key"] = secret;
  } else if (secret)
    result[config.id === "gemini" ? "x-goog-api-key" : "Authorization"] =
      config.id === "gemini" ? secret : `Bearer ${secret}`;
  return result;
}
function networkHint(config: ProviderConfig): string {
  return config.id === "lmstudio"
    ? "Check LM Studio is running, its address, CORS, local network permission, firewall, and HTTPS/mixed-content restrictions. On a phone, localhost means the phone, not your computer."
    : "Check your connection and whether this provider permits browser requests (CORS).";
}
async function request(
  config: ProviderConfig,
  path: string,
  secret: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    const options: RequestInit & { targetAddressSpace?: string } = {
      ...init,
      headers: headers(config, secret),
    };
    if (
      config.id === "lmstudio" &&
      new URL(config.endpoint).protocol === "http:"
    ) {
      const host = new URL(config.endpoint).hostname;
      options.targetAddressSpace = /^(localhost|127\.|\[::1\])/.test(host)
        ? "loopback"
        : "local";
    }
    response = await fetch(providerBaseUrl(config) + path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(`Connection failed. ${networkHint(config)}`);
  }
  if (!response.ok) {
    const hint = config.id === "openai" && path === "/responses" ? await responsesHttpHint(response) : undefined;
    init.signal?.throwIfAborted();
    if (hint) throw new Error(hint);
    const message =
      response.status === 400 && config.id === "openai" && path === "/responses"
        ? "OpenAI rejected the Responses API request (HTTP 400). Check the model and its supported settings, then retry."
        : response.status === 413 && config.id === "openai" && path === "/responses"
          ? "The request is too large for OpenAI (HTTP 413). Shorten the conversation or attachments, then retry."
          : response.status === 401
        ? "Authentication failed (HTTP 401). Check this provider's key or token."
        : response.status === 403
          ? "Access denied (HTTP 403). Check the provider's account permissions and model access."
          : response.status === 402
            ? "Payment or credit limit reached (HTTP 402). Check the provider account and key limits."
            : response.status === 404
              ? "Model or endpoint not found (HTTP 404). Check the provider, model ID, and server address."
              : response.status === 429
                ? "Rate limit or quota exceeded (HTTP 429). Wait or check the provider account."
                : `Provider returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return response;
}
export async function listModelOptions(
  config: ProviderConfig,
  secret: string,
  signal?: AbortSignal,
): Promise<ModelOption[]> {
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

export async function listModels(
  config: ProviderConfig,
  secret: string,
): Promise<string[]> {
  return (await listModelOptions(config, secret)).map(({ id }) => id);
}
export async function streamChat(
  config: ProviderConfig,
  secret: string,
  messages: Message[],
  signal: AbortSignal,
  onText: (text: string) => void,
  onReasoning: (text: string) => void = () => {},
  onSample?: (sample: ResponseSample, receivedAt: number) => void,
  tool?: ToolRequest,
  onResponsesOutput?: (items: OutputItem[]) => void,
): Promise<ToolRound | undefined> {
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
  if (config.id === "openai" && config.openaiApi === "responses") {
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
