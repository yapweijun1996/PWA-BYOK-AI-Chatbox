import { useEffect, useState } from "react";
import { requestFacts } from "./request-config";
import type { RequestSnapshot, ResolvedConfig } from "./request-config";
import { asAmount, asCount, responseThroughput } from "./response-telemetry";
import type { Message } from "./types";

export type OriginStorage = {
  usage?: number;
  quota?: number;
  persistent?: boolean;
};
export function useOriginStorage(enabled: boolean) {
  const [info, setInfo] = useState<OriginStorage>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const manager = navigator.storage;
    void Promise.all([
      manager?.estimate?.().catch(() => undefined),
      manager?.persisted?.().catch(() => undefined),
    ]).then(([estimate, persistent]) => {
      if (current)
        setInfo({
          usage: asCount(estimate?.usage),
          quota: asCount(estimate?.quota),
          persistent,
        });
    });
    return () => {
      current = false;
    };
  }, [enabled, revision]);
  return { info, refresh: () => setRevision((value) => value + 1) };
}

export const inspectionTabs = [
  "Runtime",
  "Context",
  "Configuration",
  "Telemetry",
  "Storage",
  "PWA",
] as const;
export type InspectionTab = (typeof inspectionTabs)[number];
type Primitive = boolean | number | string | null;
export type InspectionRow = Readonly<{
  key: string;
  label: string;
  value: Primitive;
  source: string;
  private?: boolean;
  unit?: "ms" | "bytes" | "timestamp";
}>;
export type InspectionRows = Readonly<
  Record<InspectionTab, readonly InspectionRow[]>
>;

// Only these constructed rows are serializable; never accept Settings, messages,
// credentials, arbitrary endpoint URLs or provider response objects as an export.
export function serializeInspection(rows: InspectionRows, at = new Date()) {
  return JSON.stringify(
    {
      version: 1,
      capturedAt: at.toISOString(),
      sections: Object.fromEntries(
        inspectionTabs.map((tab) => [
          tab,
          Object.fromEntries(
            rows[tab]
              .filter((row) => !row.private)
              .map(({ key, value, source, unit }) => [
                key,
                { value, source, unit },
              ]),
          ),
        ]),
      ),
    },
    null,
    2,
  );
}

export function safeDiagnosticLabel(
  value: string | undefined,
  sensitive: string[],
) {
  if (!value) return null;
  if (
    value.length > 256 ||
    !/^[a-z0-9][a-z0-9._/:@-]*$/i.test(value) ||
    /(?:^|[/.:@])(?:sk-|lms_|AIza|ghp_|github_pat_|Bearer)/i.test(value) ||
    value.includes("://") ||
    sensitive.some((secret) => secret && value.includes(secret))
  )
    return "Redacted";
  return value;
}

const configSources = {
  request: "Request override",
  conversation: "Conversation override",
  global: "Global settings",
  default: "Application default",
} as const;
export function configurationRows(
  prefix: string,
  config: ResolvedConfig | RequestSnapshot,
  redact: (value?: string) => string | null,
): InspectionRow[] {
  const snapshot = "config" in config ? undefined : config;
  const facts = "config" in config ? requestFacts(config) : config;
  const fact = (
    key: string,
    label: string,
    value: Primitive,
    source: string,
    extra?: Partial<InspectionRow>,
  ): InspectionRow => ({
    key: `${prefix}.${key}`,
    label,
    value,
    source,
    ...extra,
  });
  return [
    ...(snapshot
      ? [
          fact(
            "capturedAt",
            "Captured at",
            snapshot.capturedAt,
            "Request snapshot",
            { unit: "timestamp" },
          ),
        ]
      : []),
    fact(
      "provider",
      "Provider",
      facts.provider,
      configSources[facts.sources.provider],
    ),
    fact(
      "model",
      "Model",
      redact(facts.model),
      configSources[facts.sources.model],
      { private: true },
    ),
    fact(
      "endpoint",
      "Connection target",
      facts.target,
      configSources[facts.sources.endpoint],
    ),
    fact(
      "vision",
      "Image input",
      facts.vision,
      configSources[facts.sources.vision],
    ),
    fact(
      "reasoningSupported",
      "Reasoning support",
      facts.reasoningSupported,
      configSources[facts.sources.reasoningSupported],
    ),
    fact(
      "requestThoughts",
      "Request reasoning",
      facts.requestThoughts,
      configSources[facts.sources.requestThoughts],
    ),
    fact(
      "usageMode",
      "Usage request mode",
      facts.usageMode,
      "Provider adapter",
    ),
  ];
}

export function telemetryRows(
  message: Message | undefined,
  redact: (value?: string) => string | null,
): InspectionRow[] {
  const data = message?.telemetry;
  if (!data) return [];
  const usage = data.usage;
  const generation = data.generation;
  const tps = responseThroughput(data);
  const client = "Client measured";
  const provider = "Provider reported";
  return [
    {
      key: "servedModel",
      label: "Served model",
      value: redact(data.servedModel),
      source: provider,
      private: true,
    },
    {
      key: "finishReason",
      label: "Finish reason",
      value: redact(data.finishReason),
      source: provider,
      private: true,
    },
    {
      key: "reasoningEffort",
      label: "Reasoning effort",
      value: redact(data.reasoningEffort),
      source: provider,
      private: true,
    },
    {
      key: "tps",
      label: "TPS",
      value: tps?.value ?? null,
      source:
        tps?.source === "provider" ? "Provider timings" : "Client estimate",
    },
    {
      key: "ttftMs",
      label: "TTFT",
      value: asAmount(data.ttftMs) ?? null,
      source: client,
      unit: "ms",
    },
    {
      key: "ttfvMs",
      label: "TTFV",
      value: asAmount(data.ttfvMs) ?? null,
      source: client,
      unit: "ms",
    },
    {
      key: "durationMs",
      label: "Total duration",
      value: asAmount(data.durationMs) ?? null,
      source: client,
      unit: "ms",
    },
    {
      key: "generationMs",
      label: "Generation duration",
      value: asAmount(generation?.durationMs) ?? null,
      source: "Provider timings",
      unit: "ms",
    },
    {
      key: "generatedTokens",
      label: "Generated tokens",
      value: asCount(generation?.tokens) ?? null,
      source: "Provider timings",
    },
    {
      key: "promptEvaluated",
      label: "Prompt evaluation tokens",
      value: asCount(generation?.promptEvaluated) ?? null,
      source: "Provider timings",
    },
    {
      key: "timingCacheTokens",
      label: "Timing cache tokens",
      value: asCount(generation?.cacheTokens) ?? null,
      source: "Provider timings",
    },
    {
      key: "inputTokens",
      label: "Input tokens",
      value: asCount(usage?.input) ?? null,
      source: provider,
    },
    {
      key: "outputTokens",
      label: "Output tokens",
      value: asCount(usage?.output) ?? null,
      source: provider,
    },
    {
      key: "totalTokens",
      label: "Total tokens",
      value: asCount(usage?.total) ?? null,
      source: provider,
    },
    {
      key: "reasoningTokens",
      label: "Reasoning tokens",
      value: asCount(usage?.reasoning) ?? null,
      source: provider,
    },
    {
      key: "cachedTokens",
      label: "Cached tokens",
      value: asCount(usage?.cached) ?? null,
      source: provider,
    },
    {
      key: "apiCost",
      label: "API cost (USD)",
      value:
        data.provider === "lmstudio"
          ? "Local inference — no API charge"
          : (asAmount(data.cost?.usd) ?? null),
      source:
        data.provider === "lmstudio"
          ? "Provider adapter"
          : data.cost?.source === "estimated"
            ? "Catalog estimate"
            : provider,
    },
  ];
}
