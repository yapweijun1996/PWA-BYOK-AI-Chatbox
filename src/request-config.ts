import { effortFor, validEffort } from "./reasoning-effort";
import type { ReasoningEffort } from "./reasoning-effort";
import { providerBaseUrl, requestsStreamUsage } from "./providers";
import { asRecord } from "./response-telemetry";
import { defaultSettings, providerIds } from "./types";
import type { ProviderConfig, ProviderId, Settings } from "./types";

export type RequestOverrides = Readonly<
  Partial<
    Pick<
      ProviderConfig,
      "model" | "vision" | "reasoningSupported" | "requestThoughts"
    >
  > & { provider?: ProviderId; openaiApi?: "chat_completions" | "responses"; reasoningEffort?: ReasoningEffort }
>;
const layers = ["request", "conversation", "global", "default"] as const;
export type ConfigSource = (typeof layers)[number];
const fields = [
  "model",
  "vision",
  "reasoningSupported",
  "requestThoughts",
] as const;
const sourceFields = ["provider", "endpoint", ...fields] as const;
export type ResolvedConfig = {
  config: Readonly<ProviderConfig>;
  sources: Readonly<Record<(typeof sourceFields)[number], ConfigSource>>;
};

export function resolveConfig(
  settings: Settings,
  conversation?: RequestOverrides,
  request?: RequestOverrides,
): ResolvedConfig {
  const provider =
    request?.provider ??
    conversation?.provider ??
    settings.provider ??
    defaultSettings.provider;
  const global = settings.providers[provider];
  const defaults = defaultSettings.providers[provider];
  // Do not inherit capabilities or a model from a layer targeting a different provider.
  const forProvider = (layer?: RequestOverrides) =>
    !layer?.provider || layer.provider === provider ? layer : undefined;
  const requested = forProvider(request);
  const scoped = forProvider(conversation);
  const model =
    requested?.model ?? scoped?.model ?? global?.model ?? defaults.model;
  const globalProfile = global?.model === model ? global : undefined;
  const fromModel = (layer?: RequestOverrides) =>
    layer?.model === undefined || layer.model === model ? layer : undefined;
  const value = (field: (typeof fields)[number]) => {
    const top = fromModel(requested)?.[field];
    if (top !== undefined) return [top, "request"] as const;
    const local = fromModel(scoped)?.[field];
    if (local !== undefined) return [local, "conversation"] as const;
    if (
      globalProfile?.[field] !== undefined &&
      (globalProfile.model ||
        globalProfile[field] !== (defaults[field] ?? false))
    )
      return [globalProfile[field], "global"] as const;
    return [defaults[field] ?? false, "default"] as const;
  };
  const [vision, visionSource] = value("vision");
  const [support, supportSource] = value("reasoningSupported");
  const [thoughts, thoughtsSource] = value("requestThoughts");
  const globalEndpoint =
    provider === "lmstudio" &&
    global?.endpoint !== undefined &&
    global.endpoint !== defaults.endpoint;
  return {
    config: {
      id: provider,
      model,
      endpoint: globalEndpoint ? global.endpoint : defaults.endpoint,
      vision: vision === true,
      reasoningSupported: support === true,
      requestThoughts: thoughts === true,
      reasoningEffort: effortFor(provider, fromModel(requested)?.reasoningEffort ?? fromModel(scoped)?.reasoningEffort ?? global?.reasoningEfforts?.[model]),
      ...(global?.reasoningEfforts ? { reasoningEfforts: global.reasoningEfforts } : {}),
      ...(provider === "openai" ? { openaiApi: requested?.openaiApi ?? scoped?.openaiApi ?? global?.openaiApi ?? "chat_completions" } : {}),
    },
    sources: {
      provider:
        request?.provider !== undefined
          ? "request"
          : conversation?.provider !== undefined
            ? "conversation"
            : settings.provider !== defaultSettings.provider
              ? "global"
              : "default",
      model:
        requested?.model !== undefined
          ? "request"
          : scoped?.model !== undefined
            ? "conversation"
            : global?.model
              ? "global"
              : "default",
      endpoint: globalEndpoint ? "global" : "default",
      vision: visionSource,
      reasoningSupported: supportSource,
      requestThoughts: thoughtsSource,
    },
  };
}

const targets = [
  "built-in",
  "loopback HTTP",
  "loopback HTTPS",
  "network HTTP",
  "network HTTPS",
  "invalid",
] as const;
const usageModes = [
  "stream_options.include_usage",
  "usage.include",
  "provider implicit",
] as const;
export type RequestSnapshot = Readonly<{
  capturedAt: number;
  provider: ProviderId;
  model: string;
  vision: boolean;
  reasoningSupported: boolean;
  requestThoughts: boolean;
  target: (typeof targets)[number];
  usageMode: (typeof usageModes)[number];
  javascript?: boolean;
  openaiApi?: "chat_completions" | "responses";
  reasoningEffort?: ReasoningEffort;
  sources: ResolvedConfig["sources"];
}>;

export function requestFacts({
  config,
  sources,
}: ResolvedConfig): Omit<RequestSnapshot, "capturedAt"> {
  let target: RequestSnapshot["target"] = "built-in";
  if (config.id === "lmstudio") {
    try {
      const url = new URL(providerBaseUrl(config));
      const loopback =
        url.hostname === "localhost" ||
        /^127\./.test(url.hostname) ||
        url.hostname === "[::1]";
      target = `${loopback ? "loopback" : "network"} ${url.protocol === "https:" ? "HTTPS" : "HTTP"}`;
    } catch {
      target = "invalid";
    }
  }
  return {
    provider: config.id,
    model: config.model,
    vision: config.vision,
    reasoningSupported: config.reasoningSupported === true,
    requestThoughts: config.requestThoughts === true,
    target,
    reasoningEffort: config.reasoningEffort ?? "default",
    ...(config.id === "openai" ? { openaiApi: config.openaiApi ?? "chat_completions" } : {}),
    usageMode: config.id === "openai" && config.openaiApi === "responses"
      ? "provider implicit"
      : requestsStreamUsage(config.id)
      ? "stream_options.include_usage"
      : config.id === "openrouter"
        ? "usage.include"
        : "provider implicit",
    sources,
  };
}

export function captureRequest(
  resolved: ResolvedConfig,
  capturedAt = Date.now(),
  javascript = false,
): RequestSnapshot {
  const facts = requestFacts(resolved);
  return Object.freeze({
    ...facts,
    capturedAt,
    javascript,
    sources: Object.freeze({ ...facts.sources }),
  });
}

export function profileOverride(
  config: Pick<
    ProviderConfig,
    "id" | "model" | "vision" | "reasoningSupported" | "requestThoughts" | "openaiApi" | "reasoningEffort"
  >,
): RequestOverrides {
  return {
    provider: config.id,
    model: config.model,
    vision: config.vision,
    reasoningSupported: config.reasoningSupported === true,
    requestThoughts: config.requestThoughts === true,
    ...(config.id === "openai" ? { openaiApi: config.openaiApi ?? "chat_completions" } : {}),
    reasoningEffort: config.reasoningEffort ?? "default",
  };
}

export function validOverrides(value: unknown): value is RequestOverrides {
  const data = asRecord(value);
  return (
    !!data &&
    Object.keys(data).every(
      (key) =>
        key === "provider" || key === "openaiApi" || key === "reasoningEffort" || (fields as readonly string[]).includes(key),
    ) &&
    (data.provider === undefined ||
      providerIds.includes(data.provider as ProviderId)) &&
    (data.reasoningEffort === undefined || validEffort(data.reasoningEffort)) &&
    (data.openaiApi === undefined || data.openaiApi === "chat_completions" || data.openaiApi === "responses") &&
    (data.model === undefined || typeof data.model === "string") &&
    fields
      .slice(1)
      .every((key) => data[key] === undefined || typeof data[key] === "boolean")
  );
}

export function validRequestSnapshot(value: unknown): value is RequestSnapshot {
  const data = asRecord(value);
  const sources = asRecord(data?.sources);
  const allowed = [
    "capturedAt",
    "provider",
    "model",
    "vision",
    "reasoningSupported",
    "requestThoughts",
    "target",
    "usageMode",
    "javascript",
    "openaiApi",
    "reasoningEffort",
    "sources",
  ];
  return (
    !!data &&
    Object.keys(data).every((key) => allowed.includes(key)) &&
    typeof data.capturedAt === "number" &&
    Number.isFinite(data.capturedAt) &&
    providerIds.includes(data.provider as ProviderId) &&
    typeof data.model === "string" &&
    fields.slice(1).every((key) => typeof data[key] === "boolean") &&
    targets.includes(data.target as RequestSnapshot["target"]) &&
    usageModes.includes(data.usageMode as RequestSnapshot["usageMode"]) &&
    (data.javascript === undefined || typeof data.javascript === "boolean") &&
    (data.reasoningEffort === undefined || validEffort(data.reasoningEffort)) &&
    (data.openaiApi === undefined || data.openaiApi === "chat_completions" || data.openaiApi === "responses") &&
    !!sources &&
    Object.keys(sources).length === sourceFields.length &&
    sourceFields.every((key) => layers.includes(sources[key] as ConfigSource))
  );
}
