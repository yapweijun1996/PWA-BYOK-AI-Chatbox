import { responsesHttpHint } from "./responses-errors";
import { providerBaseUrl } from "./provider-config";
import type { ProviderConfig } from "./types";

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
export async function request(
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
