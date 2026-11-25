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
  if (provider === "anthropic") {
    const message = asRecord(chunk.message);
    const delta = asRecord(chunk.delta);
    const stats = asRecord(message?.usage) ?? asRecord(chunk.usage);
    return {
      generated: hasText(delta?.text) || hasText(delta?.thinking),
      servedModel: asLabel(message?.model),
      finishReason: asLabel(delta?.stop_reason),
      usage: stats && {
        input: asCount(stats.input_tokens),
        output: asCount(stats.output_tokens),
        cached: asCount(stats.cache_read_input_tokens),
      },
    };
  }
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
  const timings = provider === "lmstudio" ? asRecord(chunk.timings) : undefined;
  const tokens = asCount(timings?.predicted_n);
  const durationMs = asAmount(timings?.predicted_ms);
  // Keep runtime timings separate from standard usage: prompt_n need not include cached tokens.
  const generation =
    tokens !== undefined && durationMs !== undefined
      ? {
          tokens,
          durationMs,
          promptEvaluated: asCount(timings?.prompt_n),
          cacheTokens: asCount(timings?.cache_n),
        }
      : undefined;
  return {
    generation,
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
