import { createAdapter } from "./shared";
import type { ProviderTransport } from "./types";

export const createAnthropicAdapter = (request: ProviderTransport) => createAdapter("anthropic", request);
