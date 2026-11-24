import { providerBaseUrl } from "./providers";
import type { ProviderConfig } from "./types";

export type SessionCredential = { destination: string; value: string };

/** Use the same canonical base (including path) as the request transport. */
export function credentialDestination(config: ProviderConfig): string | undefined {
  try { return providerBaseUrl(config); } catch { return undefined; }
}

export function credentialFor(config: ProviderConfig, credential?: SessionCredential): string {
  return credential && credential.destination === credentialDestination(config) ? credential.value : "";
}
