import { defaultSettings, type ProviderConfig } from "./types";

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
export const requestsStreamUsage = (id: ProviderConfig["id"]) =>
  id === "openai" || id === "lmstudio";

