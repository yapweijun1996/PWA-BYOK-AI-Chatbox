import { createAdapter } from "./shared";
import type { ProviderTransport } from "./types";

export const createOpenrouterAdapter = (request: ProviderTransport) => createAdapter("openrouter", request);
