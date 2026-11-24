import { cancelledExecution, executionLimits, failure } from "./protocol";
import type {
  ExecutionRequest,
  ExecutionResult,
  WorkerResponse,
} from "./protocol";

export { executionLimits } from "./protocol";
export type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionStatus,
  ConsoleEntry,
} from "./protocol";

/** An isolated QuickJS instance in a fresh same-origin worker for each call. */
export function executeJavaScript(
  input: ExecutionRequest,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  if (signal?.aborted) return Promise.resolve(cancelledExecution());
  if (
    typeof input.code !== "string" ||
    !input.code.trim() ||
    input.code.length > executionLimits.sourceChars
  )
    return Promise.resolve(
      failure(
        "limit",
        "input",
        "Provide a nonempty script within the source size limit.",
      ),
    );
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./execute.worker.ts", import.meta.url), {
        type: "module",
        name: "luma-quickjs",
      });
    } catch {
      resolve(
        failure("error", "runtime", "Could not start the JavaScript worker."),
      );
      return;
    }
    let settled = false;
    let started: number | undefined;
    let timer = globalThis.setTimeout(
      () =>
        end(
          failure(
            "error",
            "runtime",
            "JavaScript runtime did not load in time.",
          ),
        ),
      executionLimits.startupMs,
    );
    function end(result: ExecutionResult) {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      resolve(result);
    }
    function cancel() {
      end({
        ...cancelledExecution(),
        durationMs:
          started === undefined ? 0 : Math.round(performance.now() - started),
      });
    }
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === "ready" && started === undefined) {
        globalThis.clearTimeout(timer);
        started = performance.now();
        timer = globalThis.setTimeout(
          () =>
            end(
              failure(
                "timeout",
                "timeout",
                "JavaScript execution timed out.",
                executionLimits.executionMs,
              ),
            ),
          executionLimits.executionMs + 250,
        );
      } else if (data.type === "result") end(data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      end(
        failure(
          "error",
          "runtime",
          "The JavaScript runtime stopped unexpectedly.",
        ),
      );
    };
    worker.onmessageerror = () =>
      end(
        failure(
          "error",
          "runtime",
          "Could not read the JavaScript worker result.",
        ),
      );
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    // Deliberately send a new object. No host state or other caller properties cross the boundary.
    try {
      worker.postMessage({ code: input.code } satisfies ExecutionRequest);
    } catch {
      end(
        failure(
          "error",
          "runtime",
          "Could not send code to the JavaScript worker.",
        ),
      );
    }
  });
}
