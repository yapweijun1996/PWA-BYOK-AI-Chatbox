import type { ExecutionResult } from "./js-tool-runtime/protocol";

/** Responses output is kept in order and bounded before any local tool is run. */
export type OutputItem = Record<string, unknown> & { type: string };
export type ResponsesExchange = {
  items: readonly OutputItem[];
  results: readonly ExecutionResult[];
};
export type ResponsesReplay = { exchanges: ResponsesExchange[]; final: OutputItem[] };
export const record = (x: unknown): Record<string, unknown> | undefined =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : undefined;
export const invalid = () =>
  new Error(
    "Responses API data is invalid or exceeds the supported size. Check model compatibility and retry.",
  );
