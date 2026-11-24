import type { ProviderConfig, ProviderId } from "./types";

export type ModelOption = {
  id: string;
  name?: string;
  vision?: boolean;
  reasoning?: boolean;
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
    vision: option.vision === true,
    reasoningSupported:
      canRequestReasoning(config.id) && option.reasoning === true,
    requestThoughts: false,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasValue(values: unknown, target: string): boolean {
  return Array.isArray(values) && values.includes(target);
}

export function parseModelOptions(
  provider: ProviderId,
  payload: object,
): ModelOption[] {
  const envelope = record(payload);
  const values = provider === "gemini" ? envelope?.models : envelope?.data;
  if (!Array.isArray(values)) return [];
  const models = new Map<string, ModelOption>();
  for (const value of values) {
    const entry = record(value);
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
    const rawName = gemini ? entry.displayName : entry.name;
    const name = typeof rawName === "string" ? rawName.trim() : undefined;
    const option: ModelOption = { id, name: name || undefined };
    if (provider === "openrouter") {
      if (hasValue(record(entry.architecture)?.input_modalities, "image"))
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
