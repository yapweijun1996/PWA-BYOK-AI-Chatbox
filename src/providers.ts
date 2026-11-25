import { responsesHttpHint } from "./responses-errors";
import { buildResponsesRequest, replay, streamResponsesPrototype } from "./openai-responses";
import type { OutputItem } from "./openai-responses";
import type { Attachment, Message, ProviderConfig } from "./types";
import { defaultSettings } from "./types";
import { parseModelOptions } from "./model-options";
import type { ModelOption } from "./model-options";
import { normalizeResponseSample } from "./provider-telemetry";
import type { ResponseSample } from "./response-telemetry";
import {
  collectToolRound,
  anthropicToolFields,
  geminiToolFields,
  maxToolReplayChars,
  openAIToolFields,
} from "./provider-tools";
import type { ToolRequest, ToolRound } from "./provider-tools";
export function providerBaseUrl(config: ProviderConfig): string {
  const endpoint =
    config.id === "lmstudio"
      ? config.endpoint
      : defaultSettings.providers[config.id].endpoint;
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[?#]/.test(url.href) // Also reject empty query/fragment delimiters.
  )
    throw new Error(
      "Enter a valid HTTP(S) endpoint without credentials, query, or fragment.",
    );
  if (config.id !== "lmstudio" && url.protocol !== "https:")
    throw new Error("Cloud providers require HTTPS.");
  return url.toString().replace(/\/$/, "");
}
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
function textAttachment(a: Attachment): string {
  return `\n\nFile: ${a.name}\n${a.data}`;
}
function openaiContent(m: Message): string | object[] {
  const attachments = m.attachments || [];
  const text =
    m.content +
    attachments
      .filter((a) => a.mime.startsWith("text/"))
      .map(textAttachment)
      .join("");
  const images = attachments.filter((a) => a.mime.startsWith("image/"));
  return images.length
    ? [
        { type: "text", text },
        ...images.map((a) => ({
          type: "image_url",
          image_url: { url: a.data },
        })),
      ]
    : text;
}
export const requestsStreamUsage = (id: ProviderConfig["id"]) =>
  id === "openai" || id === "lmstudio";

// Chat Completions rejects function tools with the model's default reasoning effort.
export const requiresLunaToolCompatibility = (
  config: Pick<ProviderConfig, "id" | "model" | "openaiApi">,
) =>
  config.id === "openai" && config.openaiApi !== "responses" && /^gpt-6-luna(?:-|$)/i.test(config.model.trim());

export function requestHistory(messages: readonly Message[]) {
  const history: Message[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.status !== "complete") continue;
    if (message.role === "assistant" && history.at(-1)?.role === "assistant")
      history[history.length - 1] = message;
    else history.push(message);
  }
  return history;
}

export function buildRequest(
  config: ProviderConfig,
  messages: Message[],
  tool?: ToolRequest,
): { path: string; body: object } {
  const completed = requestHistory(messages);
  if (config.id === "anthropic") {
    const { options, tail } = anthropicToolFields(tool);
    return {
      path: "/messages",
      body: {
        model: config.model,
        max_tokens: 4096,
        stream: true,
        ...options,
        messages: [
          ...completed.map((message) => ({
            role: message.role,
            content: [
              {
                type: "text",
                text:
                  message.content +
                  (message.attachments || [])
                    .filter((a) => a.mime.startsWith("text/"))
                    .map(textAttachment)
                    .join(""),
              },
              ...(message.attachments || [])
                .filter((a) => a.mime.startsWith("image/"))
                .map((a) => ({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: a.mime,
                    data: a.data.split(",")[1],
                  },
                })),
            ].filter((part) => !("text" in part) || part.text),
          })),
          ...tail,
        ],
      },
    };
  }
  if (config.id === "gemini") {
    const { options, tail } = geminiToolFields(tool);
    return {
      path: `/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`,
      body: {
        ...(config.requestThoughts
          ? { generationConfig: { thinkingConfig: { includeThoughts: true } } }
          : {}),
        ...options,
        contents: [
          ...completed.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [
              {
                text:
                  m.content +
                  (m.attachments || [])
                    .filter((a) => a.mime.startsWith("text/"))
                    .map(textAttachment)
                    .join(""),
              },
              ...(m.attachments || [])
                .filter((a) => a.mime.startsWith("image/"))
                .map((a) => ({
                  inline_data: {
                    mime_type: a.mime,
                    data: a.data.split(",")[1],
                  },
                })),
            ],
          })),
          ...tail,
        ],
      },
    };
  }
  const { options, tail } = openAIToolFields(tool, config.id === "openrouter");
  return {
    path: "/chat/completions",
    body: {
      model: config.model,
      stream: true,
      ...(requestsStreamUsage(config.id)
        ? { stream_options: { include_usage: true } }
        : {}),
      ...(config.id === "openrouter" ? { usage: { include: true } } : {}),
      ...(config.id === "openrouter" && config.requestThoughts
        ? { reasoning: { enabled: true } }
        : {}),
      ...(tool && requiresLunaToolCompatibility(config)
        ? { reasoning_effort: "none" }
        : {}),
      ...options,
      messages: [
        ...completed.map((m) => ({
          role: m.role,
          content: openaiContent(m),
        })),
        ...tail,
      ],
    },
  };
}
export async function parseEventStream(
  stream: ReadableStream<Uint8Array>,
  onData: (data: string, receivedAt: number) => void,
  onDone: () => void = () => {},
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedAt = performance.now();
  const consume = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data === "[DONE]") onDone();
    else if (data) onData(data, receivedAt);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      // Events in one read have the same observable arrival time.
      if (!done) receivedAt = performance.now();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// Some local models include their reasoning in leading <think> tags rather than
// using the structured reasoning field. Tags can be split across SSE chunks.
function localThinkRouter(
  onText: (text: string) => void,
  onReasoning: (text: string) => void,
) {
  let mode: "start" | "thinking" | "answer" = "start";
  let pending = "";
  const open = "<think>";
  const close = "</think>";
  const push = (text: string) => {
    if (mode === "answer") {
      onText(text);
      return;
    }
    pending += text;
    if (mode === "start") {
      const leading = pending.trimStart();
      if (
        leading.length < open.length &&
        open.startsWith(leading) &&
        pending.length <= 128
      )
        return;
      if (!leading.startsWith(open)) {
        mode = "answer";
        onText(pending);
        pending = "";
        return;
      }
      pending = leading.slice(open.length);
      mode = "thinking";
    }
    const end = pending.indexOf(close);
    if (end !== -1) {
      if (end) onReasoning(pending.slice(0, end));
      const answer = pending.slice(end + close.length);
      pending = "";
      mode = "answer";
      if (answer) onText(answer);
      return;
    }
    let keep = Math.min(pending.length, close.length - 1);
    while (keep > 0 && !close.startsWith(pending.slice(-keep))) keep--;
    const ready = pending.slice(0, pending.length - keep);
    pending = pending.slice(pending.length - keep);
    if (ready) onReasoning(ready);
  };
  return {
    push,
    flush: () => {
      if (pending) {
        if (mode === "thinking") onReasoning(pending);
        else onText(pending);
        pending = "";
      }
    },
  };
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
    } : undefined, config.requestThoughts);
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
  let received = false;
  let finished = false;
  let finishError: string | undefined;
  const collector = tool && collectToolRound();
  let roundText = "";
  const anthropicBlocks = new Map<number, number>();
  const emitText = (text: string) => {
    if (text) {
      received = true;
      if (collector && roundText.length <= maxToolReplayChars)
        roundText += text.slice(0, maxToolReplayChars + 1 - roundText.length);
      onText(text);
    }
  };
  const localTags =
    config.id === "lmstudio"
      ? localThinkRouter(emitText, onReasoning)
      : undefined;
  try {
    await parseEventStream(
      response.body,
      (data, receivedAt) => {
        let chunk;
        try {
          chunk = JSON.parse(data);
          if (!chunk || typeof chunk !== "object" || Array.isArray(chunk))
            throw new Error("Invalid stream payload");
        } catch {
          throw new Error(
            "The provider returned invalid streaming data. Partial output was retained.",
          );
        }
        const sample = normalizeResponseSample(config.id, chunk);
        onSample?.(sample, receivedAt);
        if (chunk.error)
          throw new Error("The provider reported an error while generating.");
        const finishReason = sample.finishReason;
        if (config.id === "anthropic") {
          if (
            chunk.type === "content_block_start" &&
            chunk.content_block?.type === "text" &&
            typeof chunk.content_block.text === "string"
          )
            emitText(chunk.content_block.text);
          if (
            chunk.type === "content_block_start" &&
            chunk.content_block?.type === "tool_use"
          ) {
            const index = anthropicBlocks.size;
            anthropicBlocks.set(chunk.index, index);
            collector?.openAI([
              {
                index,
                id: chunk.content_block.id,
                type: "function",
                function: { name: chunk.content_block.name },
              },
            ]);
          } else if (chunk.type === "content_block_delta") {
            if (
              chunk.delta?.type === "text_delta" &&
              typeof chunk.delta.text === "string"
            )
              emitText(chunk.delta.text);
            if (
              chunk.delta?.type === "input_json_delta" &&
              anthropicBlocks.has(chunk.index)
            )
              collector?.openAI([
                {
                  index: anthropicBlocks.get(chunk.index),
                  function: { arguments: chunk.delta.partial_json },
                },
              ]);
            if (
              chunk.delta?.type === "thinking_delta" &&
              typeof chunk.delta.thinking === "string"
            )
              onReasoning(chunk.delta.thinking);
          }
          if (chunk.type === "message_stop") finished = true;
        } else if (config.id === "gemini") {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            collector?.gemini(parts);
            for (const part of parts) {
              if (typeof part?.text !== "string" || !part.text) continue;
              if (part.thought === true) onReasoning(part.text);
              else emitText(part.text);
            }
          }
        } else {
          const delta = chunk.choices?.[0]?.delta;
          collector?.openAI(
            delta?.tool_calls,
            config.id === "openrouter" ? delta?.reasoning_details : undefined,
          );
          const reasoning = delta?.reasoning_content ?? delta?.reasoning;
          if (typeof reasoning === "string" && reasoning) {
            onReasoning(reasoning);
          } else if (
            config.id === "openrouter" &&
            Array.isArray(delta?.reasoning_details)
          ) {
            for (const detail of delta.reasoning_details) {
              const text =
                detail?.type === "reasoning.text"
                  ? detail.text
                  : detail?.type === "reasoning.summary"
                    ? detail.summary
                    : undefined;
              if (typeof text === "string" && text) onReasoning(text);
            }
          }
          if (typeof delta?.content === "string" && delta.content) {
            if (localTags) localTags.push(delta.content);
            else emitText(delta.content);
          }
        }
        // A usage-only event can follow the terminating choice, including on truncation.
        if (finishReason === "error")
          finishError =
            "The provider reported an error while generating. Partial output was retained.";
        if (
          finishReason === "length" ||
          finishReason === "MAX_TOKENS" ||
          finishReason === "max_tokens"
        )
          finishError =
            "The model reached its output limit. Partial output was retained.";
        if (finishReason === "content_filter" || finishReason === "SAFETY")
          finishError =
            "The provider stopped the response due to its content policy. Partial output was retained.";
        if (finishReason) finished = true;
      },
      () => {
        finished = true;
      },
    );
  } finally {
    localTags?.flush();
  }
  signal.throwIfAborted();
  if (finishError) throw new Error(finishError);
  if (!finished)
    throw new Error(
      "The response was interrupted before completion. Partial output was retained.",
    );
  const round = collector?.finish(roundText);
  if (!received && !round)
    throw new Error(
      "The provider returned no text. Check model compatibility or safety filters.",
    );
  return round;
}
