import type { ProviderId } from "./types";
import type { ProviderAdapter, ProviderTransport } from "./provider-adapter/types";
import { createAnthropicAdapter } from "./provider-adapter/anthropic";
import { createGeminiAdapter } from "./provider-adapter/gemini";
import { createOpenAIAdapter } from "./provider-adapter/openai";
import { createOpenrouterAdapter } from "./provider-adapter/openrouter";
import { createLmstudioAdapter } from "./provider-adapter/lmstudio";
export type { ProviderAdapter, ProviderStreamInput, ProviderTransport } from "./provider-adapter/types";

export function createProviderAdapters(request: ProviderTransport): Readonly<Record<ProviderId, ProviderAdapter>> {
  return { anthropic: createAnthropicAdapter(request), gemini: createGeminiAdapter(request), openai: createOpenAIAdapter(request), openrouter: createOpenrouterAdapter(request), lmstudio: createLmstudioAdapter(request) };
}
