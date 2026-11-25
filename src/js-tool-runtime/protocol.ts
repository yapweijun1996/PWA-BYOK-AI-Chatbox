export const executionLimits = Object.freeze({
  sourceChars: 12_000,
  executionMs: 1_500,
  startupMs: 8_000,
  memoryBytes: 16 * 1024 * 1024,
  stackBytes: 512 * 1024,
  outputChars: 4_096,
  consoleEntries: 32,
});

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
export type ConsoleEntry = Readonly<{ level: ConsoleLevel; text: string }>;
export type ExecutionStatus =
  "success" | "error" | "timeout" | "cancelled" | "limit";
export type ExecutionValue = Readonly<{
  format: "json" | "text";
  text: string;
}>;
export type ExecutionResult = Readonly<{
  status: ExecutionStatus;
  durationMs: number;
  startupMs?: number;
  executionMs?: number;
  totalMs?: number;
  console: readonly ConsoleEntry[];
  truncated: boolean;
  value?: ExecutionValue;
  error?: Readonly<{
    code:
      | "javascript"
      | "memory"
      | "timeout"
      | "cancelled"
      | "input"
      | "limit"
      | "runtime"
      | "unsupported";
    message: string;
  }>;
}>;
export type ExecutionRequest = Readonly<{ code: string }>;
export type WorkerResponse =
  { type: "ready" } | { type: "result"; result: ExecutionResult };

export function failure(
  status: Exclude<ExecutionStatus, "success">,
  code: NonNullable<ExecutionResult["error"]>["code"],
  message: string,
  durationMs = 0,
): ExecutionResult {
  return {
    status,
    durationMs,
    console: [],
    truncated: false,
    error: { code, message },
  };
}
export const cancelledExecution = () =>
  failure("cancelled", "cancelled", "Execution was cancelled.");
