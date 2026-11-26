import { providerBaseUrl } from "./provider-config";
import { defaultSettings, type ProviderConfig } from "./types";

export type SessionCredential = { destination: string; value: string };

/** Use the same canonical base (including path) as the request transport. */
export function credentialDestination(config: ProviderConfig): string | undefined {
  try { return providerBaseUrl(config); } catch { return undefined; }
}

/** Validate with the transport, but preserve the configured path for a v1 round trip. */
export function checkedLmStudioAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const endpoint = value.trim();
  return credentialDestination({ ...defaultSettings.providers.lmstudio, endpoint })
    ? endpoint
    : undefined;
}

export function credentialFor(config: ProviderConfig, credential?: SessionCredential): string {
  return credential && credential.destination === credentialDestination(config) ? credential.value : "";
}
