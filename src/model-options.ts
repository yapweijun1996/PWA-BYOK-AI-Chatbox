import type { ProviderConfig, ProviderId } from "./types";
import { asRecord, openRouterTokenPricing } from "./response-telemetry";
import type { TokenPricing } from "./response-telemetry";

export type ModelOption = {
  id: string;
  name?: string;
  vision?: boolean;
  reasoning?: boolean;
  pricing?: TokenPricing;
};

export const canRequestReasoning = (id: ProviderId) =>
  id === "gemini" || id === "openrouter";

export const compactModelName = (option: ModelOption) =>
  option.name || option.id.split("/").filter(Boolean).at(-1) || option.id;

export function configureModel(
  config: ProviderConfig,
  option: ModelOption,
): ProviderConfig {
  if (config.model === option.id) return config;
  return {
    ...config,
    model: option.id,
    reasoningEffort: config.reasoningEfforts?.[option.id] ?? "default",
    vision: option.vision === true,
    reasoningSupported:
      canRequestReasoning(config.id) && option.reasoning === true,
    requestThoughts: false,
  };
}

function hasValue(values: unknown, target: string): boolean {
  return Array.isArray(values) && values.includes(target);
}

export function parseModelOptions(
  provider: ProviderId,
  payload: object,
): ModelOption[] {
  const envelope = asRecord(payload);
  const values = provider === "gemini" ? envelope?.models : envelope?.data;
  if (!Array.isArray(values)) return [];
  const models = new Map<string, ModelOption>();
  for (const value of values) {
    const entry = asRecord(value);
    if (!entry) continue;
    const gemini = provider === "gemini";
    if (
      gemini &&
      !hasValue(entry.supportedGenerationMethods, "generateContent")
    )
      continue;
    const rawId = gemini ? entry.name : entry.id;
    if (typeof rawId !== "string" || !rawId.trim()) continue;
    const id = gemini ? rawId.replace(/^models\//, "") : rawId;
    if (!id || models.has(id)) continue;
    const rawName =
      gemini || provider === "anthropic"
        ? (entry.display_name ?? entry.displayName)
        : entry.name;
    const name = typeof rawName === "string" ? rawName.trim() : undefined;
    const option: ModelOption = { id, name: name || undefined };
    if (provider === "openrouter") {
      const pricing = openRouterTokenPricing(entry.pricing);
      if (pricing) option.pricing = pricing;
      if (hasValue(asRecord(entry.architecture)?.input_modalities, "image"))
        option.vision = true;
      if (hasValue(entry.supported_parameters, "reasoning"))
        option.reasoning = true;
    } else if (gemini && entry.thinking === true) {
      option.reasoning = true;
    }
    models.set(id, option);
  }
  return [...models.values()];
}
