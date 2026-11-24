import type { Attachment, Message, ProviderConfig } from "./types";
function baseUrl(config: ProviderConfig): string {
  const url = new URL(config.endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
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
  if (secret)
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
    response = await fetch(baseUrl(config) + path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(`Connection failed. ${networkHint(config)}`);
  }
  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "Authentication or access was rejected."
        : response.status === 429
          ? "Rate limit or quota exceeded."
          : `Provider returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return response;
}
export async function listModels(
  config: ProviderConfig,
  secret: string,
): Promise<string[]> {
  const response = await request(config, "/models", secret);
  const data = await response.json();
  const values =
    config.id === "gemini"
      ? data.models
          ?.filter((m: { supportedGenerationMethods?: string[] }) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      : data.data?.map((m: { id: string }) => m.id);
  return Array.isArray(values)
    ? values.filter((x: unknown): x is string => typeof x === "string")
    : [];
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
export function buildRequest(
  config: ProviderConfig,
  messages: Message[],
): { path: string; body: object } {
  const completed = messages.filter(
    (m) =>
      m.role === "user" || (m.role === "assistant" && m.status === "complete"),
  );
  if (config.id === "gemini")
    return {
      path: `/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`,
      body: {
        ...(config.requestThoughts
          ? { generationConfig: { thinkingConfig: { includeThoughts: true } } }
          : {}),
        contents: completed.map((m) => ({
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
                inline_data: { mime_type: a.mime, data: a.data.split(",")[1] },
              })),
          ],
        })),
      },
    };
  return {
    path: "/chat/completions",
    body: {
      model: config.model,
      stream: true,
      messages: completed.map((m) => ({
        role: m.role,
        content: openaiContent(m),
      })),
    },
  };
}
export async function parseEventStream(
  stream: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
  onDone: () => void = () => {},
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consume = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data === "[DONE]") onDone();
    else if (data) onData(data);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
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
): Promise<void> {
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
  const { path, body } = buildRequest(config, messages);
  const response = await request(config, path, secret, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (!response.body)
    throw new Error("The provider returned an empty response.");
  let received = false;
  let finished = false;
  const emitText = (text: string) => {
    if (text) {
      received = true;
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
      (data) => {
        const chunk = JSON.parse(data);
        if (chunk.error)
          throw new Error("The provider reported an error while generating.");
        if (
          chunk.candidates?.[0]?.finishReason ||
          chunk.choices?.[0]?.finish_reason
        )
          finished = true;
        if (config.id === "gemini") {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (typeof part.text !== "string" || !part.text) continue;
              if (part.thought === true) onReasoning(part.text);
              else emitText(part.text);
            }
          }
        } else {
          const delta = chunk.choices?.[0]?.delta;
          const reasoning = delta?.reasoning_content ?? delta?.reasoning;
          if (typeof reasoning === "string" && reasoning)
            onReasoning(reasoning);
          if (typeof delta?.content === "string" && delta.content) {
            if (localTags) localTags.push(delta.content);
            else emitText(delta.content);
          }
        }
      },
      () => {
        finished = true;
      },
    );
  } finally {
    localTags?.flush();
  }
  if (!received)
    throw new Error(
      "The provider returned no text. Check model compatibility or safety filters.",
    );
  if (!finished)
    throw new Error(
      "The response was interrupted before completion. Partial output was retained.",
    );
}
