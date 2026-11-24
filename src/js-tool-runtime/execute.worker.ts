import variant from "@jitl/quickjs-wasmfile-release-sync";
import wasmLocation from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
} from "quickjs-emscripten-core";
import { executionLimits as limits, failure } from "./protocol";
import type {
  ConsoleEntry,
  ConsoleLevel,
  ExecutionRequest,
  ExecutionResult,
  WorkerResponse,
} from "./protocol";

// Runs inside QuickJS, not the browser JS engine. Capture trusted intrinsics before
// the user script runs. The sole host bridge receives only pre-bounded console text.
const installConsole = `(emit => {
  const stringify = JSON.stringify;
  const string = String;
  const slice = Function.prototype.call.bind(String.prototype.slice);
  const define = Object.defineProperty;
  const levels = ["log", "info", "warn", "error", "debug"];
  const console = Object.create(null);
  let remaining = ${limits.outputChars / 2};
  let entries = ${limits.consoleEntries};
  let dropped = false;
  let recording = false;
  const format = (value, limit, error = false) => {
    let text;
    if (!error) {
      try { text = stringify(value); } catch {}
      if (text !== undefined && text.length <= limit) return 'J0' + text;
    }
    if (text === undefined) {
      try { text = string(value); } catch { text = '[unprintable value]'; }
    }
    return (text.length > limit ? 'T1' : 'T0') + slice(text, 0, limit);
  };
  for (const level of levels) define(console, level, { value: (...args) => {
    if (!entries || !remaining || recording) { dropped = true; return; }
    recording = true;
    try {
    entries--;
    let line = '';
    const width = remaining < 768 ? remaining : 768;
    if (args.length > 8) dropped = true;
    for (let i = 0; i < args.length && i < 8; i++) {
      if (i && line.length < width) line += ' ';
      if (line.length >= width) { dropped = true; break; }
      const space = width - line.length;
      const part = typeof args[i] === 'string' ? (args[i].length > space ? 'T1' : 'T0') + slice(args[i], 0, space) : format(args[i], space);
      if (part[1] === '1' || part.length - 2 > width - line.length) dropped = true;
      line += slice(part, 2, 2 + width - line.length);
    }
    remaining -= line.length;
    emit(level, line);
    } finally { recording = false; }
  }});
  define(globalThis, 'console', { value: console });
  return (value, error, query) => {
    if (query) return dropped ? '1' : '0';
    return format(value, ${limits.outputChars / 2}, error);
  };
})`;

async function run(code: string, ready: () => void): Promise<ExecutionResult> {
  const engine = await newQuickJSWASMModuleFromVariant(
    newVariant(variant, { wasmLocation }),
  );
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  let deadline = Infinity;
  let timedOut = false;
  runtime.setInterruptHandler(() => {
    if (performance.now() < deadline) return false;
    timedOut = true;
    return true;
  });
  try {
    const vm = runtime.newContext();
    try {
      const logs: ConsoleEntry[] = [];
      const bridge = vm.newFunction("emit", (level, text) => {
        logs.push({
          level: vm.getString(level) as ConsoleLevel,
          text: vm.getString(text),
        });
      });
      const installer = vm.unwrapResult(
        vm.evalCode(installConsole, "runtime.js"),
      );
      let formatter;
      try {
        formatter = vm.unwrapResult(
          vm.callFunction(installer, vm.undefined, bridge),
        );
      } finally {
        installer.dispose();
        bridge.dispose();
      }
      try {
        ready();
        const start = performance.now();
        deadline = start + limits.executionMs;
        const result = vm.evalCode(code, "tool.js", { type: "global" });
        const read = (result: ReturnType<typeof vm.callFunction>) => {
          if (result.error) {
            result.error.dispose();
            return undefined;
          }
          try {
            return vm.getString(result.value);
          } finally {
            result.value.dispose();
          }
        };
        const formatted = {
          status: "success" as ExecutionResult["status"],
          value: undefined as ExecutionResult["value"],
          error: undefined as ExecutionResult["error"],
          truncated: false,
        };
        if (result.error) {
          try {
            const note =
              !timedOut &&
              read(
                vm.callFunction(formatter, vm.undefined, result.error, vm.true),
              );
            const text = note
              ? note.slice(2)
              : "JavaScript execution failed or ran out of memory.";
            formatted.status = "error";
            formatted.error = {
              code: /out of memory/i.test(text) ? "memory" : "javascript",
              message: text,
            };
            formatted.truncated = note ? note[1] === "1" : false;
          } finally {
            result.error.dispose();
          }
        } else {
          try {
            const state = vm.getPromiseState(result.value);
            if (state.type !== "fulfilled" || !state.notAPromise) {
              if (state.type === "fulfilled") state.value.dispose();
              if (state.type === "rejected") state.error.dispose();
              formatted.status = "error";
              formatted.error = {
                code: "unsupported",
                message: "Return a synchronous value instead of a Promise.",
              };
            } else if (vm.typeof(result.value) !== "undefined") {
              const note = read(
                vm.callFunction(
                  formatter,
                  vm.undefined,
                  result.value,
                  vm.false,
                ),
              );
              if (!note) {
                formatted.status = "error";
                formatted.error = {
                  code: "memory",
                  message:
                    "Could not serialize the execution result within the memory budget.",
                };
              } else {
                formatted.value = {
                  format: note[0] === "J" ? "json" : "text",
                  text: note.slice(2),
                };
                formatted.truncated = note[1] === "1";
              }
            }
          } finally {
            result.value.dispose();
          }
        }
        if (!timedOut)
          formatted.truncated =
            read(
              vm.callFunction(
                formatter,
                vm.undefined,
                vm.undefined,
                vm.false,
                vm.true,
              ),
            ) === "1" || formatted.truncated;
        const durationMs = Math.round(performance.now() - start);
        if (timedOut || performance.now() >= deadline)
          return {
            ...failure(
              "timeout",
              "timeout",
              "JavaScript execution timed out.",
              durationMs,
            ),
            console: logs,
            truncated: formatted.truncated,
          };
        return { ...formatted, console: logs, durationMs };
      } finally {
        formatter.dispose();
      }
    } finally {
      vm.dispose();
    }
  } finally {
    runtime.dispose();
  }
}

self.addEventListener(
  "message",
  async ({ data }: MessageEvent<ExecutionRequest>) => {
    const send = (message: WorkerResponse) => self.postMessage(message);
    if (
      typeof data?.code !== "string" ||
      !data.code.trim() ||
      data.code.length > limits.sourceChars
    ) {
      send({
        type: "result",
        result: failure("limit", "input", "Invalid JavaScript source size."),
      });
      return;
    }
    try {
      const result = await run(data.code, () => send({ type: "ready" }));
      send({ type: "result", result });
    } catch {
      send({
        type: "result",
        result: failure(
          "error",
          "runtime",
          "JavaScript runtime initialization or execution failed.",
        ),
      });
    }
  },
  { once: true },
);
