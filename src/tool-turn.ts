import { toolTurnLimits } from "./javascript-tool";
import type { ToolProgress } from "./javascript-tool";
import type { ToolExchange, ToolRequest, ToolRound } from "./provider-tools";
import type { ExecutionResult } from "./js-tool-runtime";
import type { Attachment } from "./types";
import { executeToolCall, type ToolExecutor } from "./tool-executors";
export { toolExecutors } from "./tool-executors";
export type { ToolExecutionContext, ToolExecutor } from "./tool-executors";

/** Provider I/O stays with the caller; only the bounded tool transcript survives between requests in this turn. */
export function createToolTurnRunner(executeTool: ToolExecutor) {
  return async function runToolTurn(
    stream: (tool?: ToolRequest) => Promise<ToolRound | undefined>,
    enabled: boolean,
    signal: AbortSignal,
    onProgress: ToolProgress,
    attachments: readonly Attachment[] = [],
    onExchange?: (exchange: ToolExchange) => void,
  ) {
    if (!enabled) {
      await stream();
      return;
    }
    const exchanges: ToolExchange[] = [];
    let calls = 0;
    for (let turn = 0; turn <= toolTurnLimits.rounds; turn++) {
      signal.throwIfAborted();
      const allowCalls = turn < toolTurnLimits.rounds;
      const round = await stream({ allowCalls, exchanges });
      signal.throwIfAborted();
      if (!round) return;
      if (!allowCalls)
        throw new Error(
          "The model requested more tools after the reply limit. No further code was run.",
        );
      const results: ExecutionResult[] = [];
      for (const call of round.calls) {
        signal.throwIfAborted();
        results.push(await executeTool(call, { signal, onProgress, canExecute: calls++ < toolTurnLimits.calls, attachments }));
      }
      signal.throwIfAborted();
      const exchange = { round, results };
      exchanges.push(exchange);
      onExchange?.(exchange);
    }
  };
}

export const runToolTurn = createToolTurnRunner(executeToolCall);
