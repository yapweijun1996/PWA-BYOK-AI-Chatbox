/** Only known provider codes are displayed; raw provider messages can contain private data. */
const errorHints: Record<string, string> = {
  context_length_exceeded: "The conversation exceeds the model's context limit. Start a new chat or shorten the input, then retry.",
  insufficient_quota: "OpenAI quota or credits are exhausted. Check your billing and usage limits before retrying.",
  rate_limit_exceeded: "OpenAI rate limit reached. Wait a moment and retry, or check your rate limits.",
  model_not_found: "OpenAI could not find or grant access to this model. Check the model ID and account permissions.",
  invalid_api_key: "OpenAI rejected the API key. Check the key in Providers.",
  unsupported_parameter: "OpenAI rejected a request setting for this model. Check model compatibility with Responses API and local tools.",
  invalid_value: "OpenAI rejected a request setting. Check the model ID and its Responses API compatibility.",
  server_error: "OpenAI encountered a server error. Wait a moment and retry.",
};
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function responsesErrorHint(value: unknown): string | undefined {
  const error = asRecord(value);
  const code = typeof error?.code === "string" ? error.code : undefined;
  return code && Object.hasOwn(errorHints, code) ? errorHints[code] : undefined;
}

export function responsesStreamFailure(event: Record<string, unknown>): string {
  const response = asRecord(event.response);
  const incomplete = asRecord(response?.incomplete_details);
  if (event.type === "response.incomplete") {
    if (incomplete?.reason === "max_output_tokens") return "The model reached its output limit. Partial output was retained.";
    if (incomplete?.reason === "content_filter") return "The provider stopped the response due to its content policy. Partial output was retained.";
    return "OpenAI returned an incomplete response. Partial output was retained; retry or shorten the input.";
  }
  return responsesErrorHint(response?.error) ?? responsesErrorHint(event.error) ?? responsesErrorHint(event) ??
    "The provider reported an error while generating. Partial output was retained.";
}

/** Read at most 16 KiB and stop waiting after two seconds for an error body. */
export async function responsesHttpHint(response: Response): Promise<string | undefined> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 2000); });
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) return undefined;
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const payload = asRecord(JSON.parse(new TextDecoder().decode(bytes)));
    return responsesErrorHint(payload?.error);
  } catch { return undefined; }
  finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
