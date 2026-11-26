import { executeJavaScript } from "./js-tool-runtime";
import {
  cancelledExecution,
  executionLimits,
  failure,
} from "./js-tool-runtime/protocol";
import { storage } from "./storage";
import type { Attachment } from "./types";
import type { ExecutionResult } from "./js-tool-runtime";
import type { ToolCall, ToolProgress } from "./javascript-tool";

export { localToolDefinitions, localToolNames } from "./tool-definitions";
type Args = Record<string, unknown>;
const text = (value: unknown, max = 4000): string => {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid or oversized text argument.");
  return value;
};
const success = (value: unknown, start: number): ExecutionResult => {
  const encoded = JSON.stringify(value) ?? "null";
  const truncated = encoded.length > executionLimits.outputChars;
  return {
    status: "success",
    durationMs: Math.round(performance.now() - start),
    console: [],
    truncated,
    value: {
      format: truncated ? "text" : "json",
      text: truncated ? encoded.slice(0, executionLimits.outputChars) : encoded,
    },
  };
};
async function analyzeFile(
  file: Attachment,
  action: string,
  offset: number,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./local-file.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const cancel = () => finish(new Error("Execution was cancelled."));
    const timer = setTimeout(
      () => finish(new Error("File analysis timed out.")),
      5000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => finish(new Error("File analysis failed."));
    worker.onmessage = ({ data }) =>
      data?.error ? finish(new Error(data.error)) : finish(undefined, data);
    if (signal.aborted) cancel();
    else
      worker.postMessage({
        name: file.name,
        text: file.data,
        operation: action,
        offset,
      });
  });
}

export async function runLocalTool(
  call: ToolCall,
  signal: AbortSignal,
  progress: ToolProgress,
  canExecute: boolean,
  attachments: readonly Attachment[],
): Promise<ExecutionResult> {
  const start = performance.now();
  const record = {
    id: crypto.randomUUID(),
    name: call.name,
    code: call.arguments.slice(0, executionLimits.sourceChars),
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
  else {
    progress(record);
    try {
      let committed = false;
      const args: Args = JSON.parse(call.arguments);
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("Invalid tool arguments.");
      let value: unknown;
      switch (call.name) {
        case "time_tool": {
          const action = text(args.action, 20);
          if (action === "difference") {
            const startDate = Date.parse(text(args.date, 100));
            const endDate = Date.parse(text(args.end, 100));
            if (!Number.isFinite(startDate) || !Number.isFinite(endDate))
              throw new Error("Provide valid ISO dates.");
            value = { milliseconds: endDate - startDate };
          } else if (action === "now" || action === "convert") {
            const date =
              action === "now" ? new Date() : new Date(text(args.date, 100));
            if (!Number.isFinite(date.getTime()))
              throw new Error("Provide a valid ISO date.");
            const timezone =
              args.timezone === undefined
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : text(args.timezone, 100);
            value = {
              iso: date.toISOString(),
              timezone,
              local: new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                dateStyle: "full",
                timeStyle: "long",
              }).format(date),
            };
          } else throw new Error("Unknown time action.");
          break;
        }
        case "calculate": {
          const expression = text(args.expression, 4000);
          result = await executeJavaScript({ code: expression }, signal);
          progress({ ...record, result });
          return result;
        }
        case "text_tool": {
          const action = text(args.action, 20);
          const input = text(args.text);
          const search = args.search === undefined ? "" : text(args.search);
          const replacement =
            args.replacement === undefined ? "" : text(args.replacement);
          if (action === "replace") {
            if (!search) throw new Error("Search text must not be empty.");
            value = input.split(search).join(replacement);
          } else if (action === "extract") {
            if (!search) throw new Error("A regular expression is required.");
            const code = `Array.from(${JSON.stringify(input)}.matchAll(new RegExp(${JSON.stringify(search)}, "g")), match => match[0]).slice(0, 100)`;
            result = await executeJavaScript({ code }, signal);
            progress({ ...record, result });
            return result;
          } else if (action === "find") {
            if (!search) throw new Error("Search text must not be empty.");
            const indexes: number[] = [];
            for (let pos = 0; pos < input.length && indexes.length < 100;) {
              const found = input.indexOf(search, pos);
              if (found < 0) break;
              indexes.push(found);
              pos = found + search.length;
            }
            value = { indexes };
          } else if (action === "sort")
            value = input.split(/\r?\n/).sort().join("\n");
          else if (action === "unique")
            value = [...new Set(input.split(/\r?\n/))].join("\n");
          else throw new Error("Unknown text action.");
          break;
        }
        case "analyze_file": {
          const action = text(args.action, 20);
          if (action === "list") {
            value = attachments
              .filter((file) => file.mime.startsWith("text/"))
              .map(({ id, name, size }) => ({ id, name, size }));
            break;
          }
          const name = text(args.file, 256);
          if (!["summary", "read"].includes(action))
            throw new Error("Unknown file action.");
          const matches = attachments.filter(
            (file) => file.id === name || file.name === name,
          );
          if (matches.length !== 1 || !matches[0].mime.startsWith("text/"))
            throw new Error(
              "Select a unique text, CSV, or JSON attachment from this conversation.",
            );
          const offset = args.offset === undefined ? 0 : args.offset;
          if (
            typeof offset !== "number" ||
            !Number.isSafeInteger(offset) ||
            offset < 0
          )
            throw new Error("Invalid file offset.");
          value = await analyzeFile(matches[0], action, offset, signal);
          break;
        }
        case "memory_tool": {
          const action = text(args.action, 20);
          if (action === "list") {
            const offset = args.offset === undefined ? 0 : args.offset;
            if (
              typeof offset !== "number" ||
              !Number.isSafeInteger(offset) ||
              offset < 0
            )
              throw new Error("Invalid memory offset.");
            const memories = await storage.listMemories();
            value = {
              keys: memories.slice(offset, offset + 20).map((item) => item.key),
              nextOffset: offset + 20 < memories.length ? offset + 20 : null,
            };
          } else {
            const key = text(args.key, 120).trim();
            if (!key) throw new Error("A memory key is required.");
            if (action === "save") {
              await storage.saveMemory(key, text(args.value, 2000), signal);
              committed = true;
              value = { key, saved: true };
            } else if (action === "delete") {
              await storage.deleteMemory(key, signal);
              committed = true;
              value = { key, deleted: true };
            } else if (action === "get")
              value =
                (await storage.listMemories()).find(
                  (item) => item.key === key,
                ) ?? null;
            else throw new Error("Unknown memory action.");
          }
          break;
        }
        default:
          throw new Error("This tool is not available.");
      }
      result =
        signal.aborted && !committed
          ? cancelledExecution()
          : success(value, start);
    } catch (error) {
      result = signal.aborted
        ? cancelledExecution()
        : failure(
            "error",
            "input",
            error instanceof Error ? error.message : "Tool failed.",
            Math.round(performance.now() - start),
          );
    }
  }
  progress({ ...record, result });
  return result;
}
