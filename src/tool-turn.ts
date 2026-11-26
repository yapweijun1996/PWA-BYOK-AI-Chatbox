import { providerToolName, runJavascriptTool, toolTurnLimits } from "./javascript-tool";
import type { ToolCall, ToolProgress } from "./javascript-tool";
import type { ToolExchange, ToolRequest, ToolRound } from "./provider-tools";
import type { ExecutionResult } from "./js-tool-runtime";
import { localToolNames, runLocalTool } from "./local-tools";
import type { Attachment } from "./types";

export type ToolExecutionContext = {
  signal: AbortSignal;
  onProgress: ToolProgress;
  canExecute: boolean;
  attachments: readonly Attachment[];
};
export type ToolExecutor = (call: ToolCall, context: ToolExecutionContext) => Promise<ExecutionResult>;
const executeLocal: ToolExecutor = (call, context) => runLocalTool(call, context.signal, context.onProgress, context.canExecute, context.attachments);
const executeJavaScript: ToolExecutor = (call, context) => runJavascriptTool(call, context.signal, context.onProgress, context.canExecute);
export const toolExecutors: Readonly<Record<string, ToolExecutor>> = Object.freeze({
  ...Object.fromEntries(localToolNames.map((name) => [name, executeLocal])),
  [providerToolName]: executeJavaScript,
});

/** Provider I/O stays with the caller; only the bounded tool transcript survives between requests in this turn. */
export async function runToolTurn(
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
      const execute = Object.hasOwn(toolExecutors, call.name) ? toolExecutors[call.name] : executeJavaScript;
      results.push(await execute(call, { signal, onProgress, canExecute: calls++ < toolTurnLimits.calls, attachments }));
    }
    signal.throwIfAborted();
    const exchange = { round, results };
    exchanges.push(exchange);
    onExchange?.(exchange);
  }
}
