import { effortFor } from "./reasoning-effort";
import { requestsStreamUsage } from "./provider-config";
import { anthropicToolFields, geminiToolFields, openAIToolFields } from "./provider-tool-encoding";
import type { ToolRequest } from "./provider-tool-types";
import type { Attachment, Message, ProviderConfig, ProviderId } from "./types";

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

export type ProviderRequest = { path: string; body: object };
export type ProviderRequestAdapter = (config: ProviderConfig, completed: Message[], tool?: ToolRequest) => ProviderRequest;

const anthropicRequest: ProviderRequestAdapter = (config: ProviderConfig, completed: Message[], tool?: ToolRequest): ProviderRequest => {
    const { options, tail } = anthropicToolFields(tool);
    return {
      path: "/messages",
      body: {
        model: config.model,
        max_tokens: 4096,
        ...(effortFor(config.id, config.reasoningEffort) !== "default" ? { output_config: { effort: effortFor(config.id, config.reasoningEffort) } } : {}),
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
};

const geminiRequest: ProviderRequestAdapter = (config: ProviderConfig, completed: Message[], tool?: ToolRequest): ProviderRequest => {
    const { options, tail } = geminiToolFields(tool);
    return {
      path: `/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`,
      body: {
        ...(config.requestThoughts || effortFor(config.id, config.reasoningEffort) !== "default"
          ? { generationConfig: { thinkingConfig: { ...(config.requestThoughts ? { includeThoughts: true } : {}), ...(effortFor(config.id, config.reasoningEffort) !== "default" ? { thinkingLevel: effortFor(config.id, config.reasoningEffort).toUpperCase() } : {}) } } }
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
};

const openAICompatibleRequest: ProviderRequestAdapter = (config: ProviderConfig, completed: Message[], tool?: ToolRequest): ProviderRequest => {
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
      ...(config.id === "openrouter" && (config.requestThoughts || effortFor(config.id, config.reasoningEffort) !== "default")
        ? { reasoning: { ...(config.requestThoughts ? { enabled: true } : {}), ...(effortFor(config.id, config.reasoningEffort) !== "default" ? { effort: effortFor(config.id, config.reasoningEffort) } : {}) } }
        : {}),
      ...(tool && requiresLunaToolCompatibility(config)
        ? { reasoning_effort: "none" }
        : config.id !== "openrouter" && effortFor(config.id, config.reasoningEffort) !== "default"
          ? { reasoning_effort: effortFor(config.id, config.reasoningEffort) } : {}),
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
};

export const providerRequestAdapters: Record<ProviderId, ProviderRequestAdapter> = {
  anthropic: anthropicRequest, gemini: geminiRequest, openai: openAICompatibleRequest, openrouter: openAICompatibleRequest, lmstudio: openAICompatibleRequest,
};

export function buildRequest(config: ProviderConfig, messages: Message[], tool?: ToolRequest): ProviderRequest {
  return providerRequestAdapters[config.id](config, requestHistory(messages), tool);
}
