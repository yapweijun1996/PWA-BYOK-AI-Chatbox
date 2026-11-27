import { providerToolName, runJavascriptTool } from "./javascript-tool";
import type { ToolCall, ToolProgress } from "./javascript-tool";
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

/** Unknown names follow the existing JavaScript tool validation and failure path. */
export const executeToolCall: ToolExecutor = (call, context) => {
  const execute = Object.hasOwn(toolExecutors, call.name) ? toolExecutors[call.name] : executeJavaScript;
  return execute(call, context);
};
