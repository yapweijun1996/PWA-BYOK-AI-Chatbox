import type { ProviderId } from "./types";

export const effortValues = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = typeof effortValues[number];
export const validEffort = (value: unknown): value is ReasoningEffort =>
  typeof value === "string" && (effortValues as readonly string[]).includes(value);
export function effortOptions(provider: ProviderId): readonly ReasoningEffort[] {
  if (provider === "anthropic") return ["default", "low", "medium", "high", "max"];
  if (provider === "gemini") return ["default", "minimal", "low", "medium", "high"];
  return ["default", "none", "minimal", "low", "medium", "high", "xhigh"];
}
export const effortFor = (provider: ProviderId, value: unknown): ReasoningEffort =>
  validEffort(value) && effortOptions(provider).includes(value) ? value : "default";
export function cleanModelEfforts(provider: ProviderId, value: unknown): Record<string, ReasoningEffort> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(([key, effort]) => key.length > 0 && key.length <= 256 && effortFor(provider, effort) !== "default").slice(0, 500);
  return entries.length ? Object.fromEntries(entries) as Record<string, ReasoningEffort> : undefined;
}
