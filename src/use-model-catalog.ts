import { useMemo, useState } from "react";
import { canRequestReasoning, type ModelOption } from "./model-options";
import { providerIds } from "./types";
import type { ProviderConfig, ProviderId, Settings } from "./types";

export type ModelCatalogs = Partial<Record<ProviderId, { endpoint: string; options: ModelOption[] }>>;

export function useModelCatalog(settings: Settings, config: Readonly<ProviderConfig>, t: (text: string) => string) {
  const [catalogs, setCatalogs] = useState<ModelCatalogs>({});
  const modelGroups = useMemo(() => providerIds.map((provider) => {
    const { model, endpoint } = settings.providers[provider];
    const catalog = catalogs[provider];
    const options = catalog?.endpoint === endpoint ? catalog.options : [];
    return { provider, options: model && !options.some(({ id }) => id === model) ? [{ id: model }, ...options] : options };
  }), [catalogs, settings.providers]);
  const models = modelGroups.find(({ provider }) => provider === config.id)?.options || [];
  const selectedModel = models.find(({ id }) => id === config.model) ?? (config.model ? { id: config.model } : undefined);
  const reasoningAvailable = Boolean(selectedModel) && canRequestReasoning(config.id) &&
    (selectedModel?.reasoning === true || config.reasoningSupported === true || config.requestThoughts === true);
  const reasoningLabel = t(config.id === "gemini" ? "Request thought summaries" : "Request reasoning");
  return { catalogs, setCatalogs, modelGroups, models, selectedModel, reasoningAvailable, reasoningLabel };
}
