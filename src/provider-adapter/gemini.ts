import { createAdapter } from "./shared";
import type { ProviderTransport } from "./types";

export const createGeminiAdapter = (request: ProviderTransport) => createAdapter("gemini", request);
