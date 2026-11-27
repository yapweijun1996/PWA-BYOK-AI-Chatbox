import { executionLimits } from "../js-tool-runtime/protocol";
import { maxToolReplayChars } from "../provider-tool-types";

export const maxArguments = executionLimits.sourceChars * 6 + 256;
export const record = (input: unknown): Record<string, unknown> | undefined =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
export const string = (input: unknown) => (typeof input === "string" ? input : "");
export const malformed = () =>
  new Error(
    "The provider returned an invalid or oversized tool call. No code was executed for this round.",
  );

export function createContextBudget() {
  let contextChars = 0;
  let overflow = false;
  return {
    absorb(size: number) { contextChars += size; overflow ||= contextChars > maxToolReplayChars; return !overflow; },
    reject() { overflow = true; },
    exceeded() { return overflow; },
  };
}
export type ContextBudget = ReturnType<typeof createContextBudget>;
