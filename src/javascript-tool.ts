import { executeJavaScript } from "./js-tool-runtime";
import {
  cancelledExecution,
  executionLimits,
  failure,
} from "./js-tool-runtime/protocol";
import type { ExecutionResult } from "./js-tool-runtime";
import { localToolNames } from "./local-tools";

export const javascriptToolName = "javascript.execute";
// Function names on provider APIs cannot reliably contain a dot.
export const providerToolName = "javascript_execute";
export const toolTurnLimits = Object.freeze({ rounds: 2, calls: 4 });
export const javascriptToolParameters = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description:
        "Synchronous JavaScript source. The final expression is the result; use console.log for output.",
    },
  },
  required: ["code"],
};
export const javascriptToolDescription =
  "Run synchronous JavaScript for calculations and data transformation in an isolated offline sandbox. No browser APIs, network, I/O, credentials, imports, timers, or external packages. Use console.log for output and a final expression for the result. Do not place secrets in code.";

export type ToolCall = Readonly<{
  id: string;
  name: string;
  arguments: string;
}>;
export type ToolExecution = Readonly<{
  id: string;
  name: string;
  code: string;
  startedAt: number;
  stage?: "starting" | "running";
  result?: ExecutionResult;
}>;
export type ToolProgress = (record: ToolExecution) => void;

export async function runJavascriptTool(
  call: ToolCall,
  signal: AbortSignal,
  onProgress: ToolProgress,
  canExecute: boolean,
): Promise<ExecutionResult> {
  if (call.name !== providerToolName)
    return failure("error", "unsupported", "This tool is not available.");
  let source: unknown;
  try {
    source = JSON.parse(call.arguments)?.code;
  } catch {
    /* Report malformed tool arguments below. */
  }
  const validSource =
    typeof source === "string" &&
    source.length <= executionLimits.sourceChars &&
    Boolean(source.trim());
  const execution: ToolExecution = {
    id: crypto.randomUUID(),
    name: javascriptToolName,
    code:
      typeof source === "string"
        ? source.slice(0, executionLimits.sourceChars)
        : "",
    startedAt: Date.now(),
  };
  let result: ExecutionResult;
  if (signal.aborted) result = cancelledExecution();
  else if (!canExecute)
    result = failure(
      "limit",
      "limit",
      "The tool call limit for this reply was reached.",
    );
  else if (!validSource)
    result = failure(
      "limit",
      "input",
      "The tool requires a nonempty code string within the source size limit.",
    );
  else {
    result = await executeJavaScript({ code: execution.code }, signal, (stage) =>
      onProgress({ ...execution, stage }),
    );
  }
  onProgress({ ...execution, result });
  return result;
}

export function restoreToolExecutions(
  executions?: ToolExecution[],
): ToolExecution[] | undefined {
  return executions?.map((record) =>
    record.result ? record : { ...record, result: failure("cancelled", "cancelled", "Execution was interrupted before completion.") },
  );
}

export function validToolExecutions(value: unknown): value is ToolExecution[] {
  if (
    !Array.isArray(value) ||
    value.length > toolTurnLimits.calls * toolTurnLimits.rounds
  )
    return false;
  const unique = new Set<string>();
  const numeric = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  return value.every((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      item.id.length > 160 ||
      unique.has(item.id) ||
      (item.name !== javascriptToolName && !localToolNames.includes(item.name)) ||
      typeof item.code !== "string" ||
      item.code.length > executionLimits.sourceChars ||
      !numeric(item.startedAt) ||
      (item.stage !== undefined && !["starting", "running"].includes(item.stage))
    )
      return false;
    unique.add(item.id);
    if (item.result === undefined) return true;
    const result = item.result;
    if (
      !result ||
      typeof result !== "object" ||
      !["success", "error", "timeout", "cancelled", "limit"].includes(
        result.status,
      ) ||
      !numeric(result.durationMs) ||
      [result.startupMs, result.executionMs, result.totalMs].some((n) => n !== undefined && !numeric(n)) ||
      typeof result.truncated !== "boolean" ||
      !Array.isArray(result.console) ||
      result.console.length > executionLimits.consoleEntries
    )
      return false;
    let count = 0;
    for (const entry of result.console) {
      if (
        !entry ||
        !["log", "info", "warn", "error", "debug"].includes(entry.level) ||
        typeof entry.text !== "string"
      )
        return false;
      count += entry.text.length;
    }
    if (result.value !== undefined) {
      if (
        !result.value ||
        !["json", "text"].includes(result.value.format) ||
        typeof result.value.text !== "string" ||
        result.status !== "success"
      )
        return false;
      count += result.value.text.length;
    }
    if (result.status !== "success") {
      if (
        !result.error ||
        ![
          "javascript",
          "memory",
          "timeout",
          "cancelled",
          "input",
          "limit",
          "runtime",
          "unsupported",
        ].includes(result.error.code) ||
        typeof result.error.message !== "string"
      )
        return false;
      count += result.error.message.length;
    } else if (result.error !== undefined) return false;
    return count <= executionLimits.outputChars;
  });
}
