import { providerIds } from "./types";
import type { ProviderConfig, ProviderId } from "./types";

export type ResponseUsage = {
  input?: number;
  output?: number;
  total?: number;
  reasoning?: number;
  cached?: number;
};
export type ResponseCost = { usd: number; source: "reported" | "estimated" };
export type ResponseTelemetry = {
  provider: ProviderId;
  model: string;
  servedModel?: string;
  durationMs?: number;
  ttftMs?: number;
  ttfvMs?: number;
  lastGeneratedMs?: number;
  usage?: ResponseUsage;
  cost?: ResponseCost;
  reasoningEffort?: string;
  finishReason?: string;
};
export type ResponseSample = {
  generated?: boolean;
  servedModel?: string;
  usage?: ResponseUsage;
  costUsd?: number;
  reasoningEffort?: string;
  finishReason?: string;
};
export type TokenPricing = {
  input: number;
  output: number;
  cacheRead?: number;
};

const usageKeys = ["input", "output", "total", "reasoning", "cached"] as const;
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function asAmount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
export function asCount(value: unknown): number | undefined {
  const amount = asAmount(value);
  return amount !== undefined && Number.isSafeInteger(amount)
    ? amount
    : undefined;
}
export function asLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const text = value.trim();
  return text && text.length <= 512 ? text : undefined;
}

function asRate(value: unknown) {
  return asAmount(
    typeof value === "string" && value.trim() ? Number(value) : value,
  );
}

export function openRouterTokenPricing(
  value: unknown,
): TokenPricing | undefined {
  const pricing = asRecord(value);
  if (!pricing) return;
  // Do not estimate when the catalog lists an extra request, cache-write or reasoning rate.
  if (
    ["request", "input_cache_write", "internal_reasoning"].some(
      (key) => pricing[key] != null && asRate(pricing[key]) !== 0,
    )
  )
    return;
  const input = asRate(pricing.prompt);
  const output = asRate(pricing.completion);
  const cacheRead = asRate(pricing.input_cache_read);
  if (input === undefined || output === undefined) return;
  if (pricing.input_cache_read != null && cacheRead === undefined) return;
  return cacheRead === undefined
    ? { input, output }
    : { input, output, cacheRead };
}

function estimateCost(
  usage: ResponseUsage | undefined,
  pricing: TokenPricing | undefined,
) {
  if (!pricing || usage?.input === undefined || usage.output === undefined)
    return;
  const { input, output, cached } = usage;
  if (
    cached === undefined &&
    pricing.cacheRead !== undefined &&
    pricing.cacheRead !== pricing.input
  )
    return;
  if (
    cached !== undefined &&
    (cached > input || (cached > 0 && pricing.cacheRead === undefined))
  )
    return;
  const hits = cached ?? 0;
  return asAmount(
    (input - hits) * pricing.input +
      hits * (pricing.cacheRead ?? 0) +
      output * pricing.output,
  );
}

export function responseIdentity(config: ProviderConfig): ResponseTelemetry {
  return { provider: config.id, model: config.model };
}

export function createResponseTracker(
  identity: ResponseTelemetry,
  pricing?: TokenPricing,
  clock = () => performance.now(),
) {
  const start = clock();
  const current = { ...identity };
  let reportedCost: number | undefined;
  const elapsed = (at = clock()) => Math.max(0, at - start);
  return {
    receive(sample: ResponseSample, receivedAt?: number): boolean {
      let changed = false;
      if (sample.generated) {
        const arrival = elapsed(receivedAt);
        if (current.ttftMs === undefined) {
          current.ttftMs = arrival;
          changed = true;
        } else if (arrival > (current.lastGeneratedMs ?? current.ttftMs)) {
          current.lastGeneratedMs = arrival;
        }
      }
      for (const key of [
        "servedModel",
        "reasoningEffort",
        "finishReason",
      ] as const) {
        const next = sample[key];
        if (next !== undefined && current[key] !== next) {
          current[key] = next;
          changed = true;
        }
      }
      if (sample.usage) {
        for (const key of usageKeys) {
          const next = sample.usage[key];
          if (next !== undefined && current.usage?.[key] !== next) {
            (current.usage ??= {})[key] = next;
            changed = true;
          }
        }
      }
      if (sample.costUsd !== undefined && reportedCost !== sample.costUsd) {
        reportedCost = sample.costUsd;
        changed = true;
      }
      return changed;
    },
    visible(text: string) {
      if (text.trim() && current.ttfvMs === undefined)
        current.ttfvMs = elapsed();
    },
    snapshot(): ResponseTelemetry {
      const estimated =
        current.servedModel && current.servedModel !== current.model
          ? undefined
          : estimateCost(current.usage, pricing);
      const cost: ResponseCost | undefined =
        reportedCost !== undefined
          ? { usd: reportedCost, source: "reported" }
          : estimated !== undefined
            ? { usd: estimated, source: "estimated" }
            : undefined;
      return {
        ...current,
        usage: current.usage && { ...current.usage },
        durationMs: elapsed(),
        cost,
      };
    },
  };
}

export function responseTps(telemetry?: ResponseTelemetry): number | undefined {
  if (
    telemetry?.ttftMs === undefined ||
    telemetry.lastGeneratedMs === undefined ||
    telemetry.usage?.output === undefined
  )
    return;
  const span = telemetry.lastGeneratedMs - telemetry.ttftMs;
  return span > 0
    ? asAmount((telemetry.usage.output * 1000) / span)
    : undefined;
}

export function validResponseTelemetry(
  value: unknown,
): value is ResponseTelemetry {
  const data = asRecord(value);
  if (
    !data ||
    !providerIds.includes(data.provider as ProviderId) ||
    typeof data.model !== "string"
  )
    return false;
  if (
    ["servedModel", "reasoningEffort", "finishReason"].some(
      (key) => data[key] !== undefined && asLabel(data[key]) === undefined,
    )
  )
    return false;
  if (
    ["durationMs", "ttftMs", "ttfvMs", "lastGeneratedMs"].some(
      (key) => data[key] !== undefined && asAmount(data[key]) === undefined,
    )
  )
    return false;
  if (data.usage !== undefined) {
    const usage = asRecord(data.usage);
    if (
      !usage ||
      usageKeys.some(
        (key) => usage[key] !== undefined && asCount(usage[key]) === undefined,
      )
    )
      return false;
  }
  if (data.cost !== undefined) {
    const cost = asRecord(data.cost);
    if (
      !cost ||
      asAmount(cost.usd) === undefined ||
      (cost.source !== "reported" && cost.source !== "estimated")
    )
      return false;
  }
  return true;
}
