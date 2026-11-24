import { asAmount, asCount, asLabel, asRecord } from "./response-telemetry";
import type { ResponseSample, ResponseUsage } from "./response-telemetry";
import type { ProviderId } from "./types";

const hasText = (value: unknown) =>
  typeof value === "string" && value.length > 0;
const first = (value: unknown) =>
  Array.isArray(value) ? asRecord(value[0]) : undefined;

export function normalizeResponseSample(
  provider: ProviderId,
  value: unknown,
): ResponseSample {
  const chunk = asRecord(value);
  if (!chunk) return {};
  const candidate = first(chunk.candidates);
  const choice = first(chunk.choices);
  const finishReason =
    asLabel(candidate?.finishReason) ?? asLabel(choice?.finish_reason);
  if (provider === "gemini") {
    const stats = asRecord(chunk.usageMetadata);
    const parts = asRecord(candidate?.content)?.parts;
    return {
      generated:
        Array.isArray(parts) &&
        parts.some((part) => hasText(asRecord(part)?.text)),
      servedModel: asLabel(chunk.modelVersion),
      finishReason,
      usage: stats && {
        input: asCount(stats.promptTokenCount),
        output: asCount(stats.candidatesTokenCount),
        total: asCount(stats.totalTokenCount),
        reasoning: asCount(stats.thoughtsTokenCount),
        cached: asCount(stats.cachedContentTokenCount),
      },
    };
  }
  const delta = asRecord(choice?.delta);
  const details = delta?.reasoning_details;
  const stats = asRecord(chunk.usage);
  const usage: ResponseUsage | undefined = stats && {
    input: asCount(stats.prompt_tokens),
    output: asCount(stats.completion_tokens),
    total: asCount(stats.total_tokens),
    reasoning: asCount(
      asRecord(stats.completion_tokens_details)?.reasoning_tokens,
    ),
    cached: asCount(asRecord(stats.prompt_tokens_details)?.cached_tokens),
  };
  return {
    generated:
      hasText(delta?.content) ||
      hasText(delta?.reasoning_content) ||
      hasText(delta?.reasoning) ||
      (provider === "openrouter" &&
        Array.isArray(details) &&
        details.some((value) => {
          const detail = asRecord(value);
          return (
            (detail?.type === "reasoning.text" && hasText(detail.text)) ||
            (detail?.type === "reasoning.summary" && hasText(detail.summary))
          );
        })),
    servedModel: asLabel(chunk.model),
    finishReason,
    reasoningEffort:
      asLabel(chunk.reasoning_effort) ??
      asLabel(asRecord(chunk.reasoning)?.effort),
    usage,
    costUsd: provider === "openrouter" ? asAmount(stats?.cost) : undefined,
  };
}
