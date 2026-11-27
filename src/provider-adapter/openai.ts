import { effortFor } from "../reasoning-effort";
import { buildResponsesRequest } from "../responses-request";
import { replay } from "../responses-replay";
import { streamResponsesPrototype } from "../responses-stream";
import { createAdapter, streamStandard, validateInput } from "./shared";
import type { ProviderStreamInput, ProviderTransport } from "./types";

async function streamResponses(request: ProviderTransport, input: ProviderStreamInput) {
  validateInput(input);
  const { config, secret, messages, signal, onText, onReasoning, onSample, tool, onResponsesOutput } = input;
  const body = buildResponsesRequest(config.model, messages, tool ? {
    allowCalls: tool.allowCalls,
    exchanges: tool.exchanges.map(({ round, results }) => {
      if (!round.responsesItems) throw new Error("Missing Responses tool transcript.");
      return { items: round.responsesItems, results };
    }),
    requestSummary: config.requestThoughts,
  } : undefined, config.requestThoughts, effortFor(config.id, config.reasoningEffort));
  const result = await streamResponsesPrototype(
    (payload, requestSignal) => request(config, "/responses", secret, { method: "POST", body: JSON.stringify(payload), signal: requestSignal }),
    body, signal, onText, onReasoning,
  );
  // Reject malformed replay items before allowing any requested local tool to run.
  replay(result.output, result.calls.map(() => ({} as import("../js-tool-runtime").ExecutionResult)));
  const usage = result.usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } } | undefined;
  if (usage) onSample?.({ usage: { input: usage.input_tokens, output: usage.output_tokens, total: usage.total_tokens, cached: usage.input_tokens_details?.cached_tokens, reasoning: usage.output_tokens_details?.reasoning_tokens } }, performance.now());
  onResponsesOutput?.(result.output);
  if (!result.calls.length) return undefined;
  if (!tool || !tool.allowCalls) throw new Error("The model requested tools when tools were disabled.");
  return { calls: result.calls, text: "", geminiParts: [], reasoningDetails: [], responsesItems: result.output };
}
export const createOpenAIAdapter = (request: ProviderTransport) => createAdapter("openai", request, (input) => input.config.openaiApi === "responses" ? streamResponses(request, input) : streamStandard(request, input));
