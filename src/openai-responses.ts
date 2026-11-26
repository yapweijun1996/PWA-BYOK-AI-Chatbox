import {
  javascriptToolDescription,
  javascriptToolParameters,
  providerToolName,
  toolTurnLimits,
} from "./javascript-tool";
import { localToolDefinitions } from "./tool-definitions";
import { executionLimits } from "./js-tool-runtime/protocol";
import { maxToolReplayChars } from "./provider-tools";
import type { ExecutionResult } from "./js-tool-runtime/protocol";
import type { Message } from "./types";

import { invalid, record } from "./responses-types";
import type { OutputItem, ResponsesExchange, ResponsesReplay } from "./responses-types";
export type { OutputItem, ResponsesExchange, ResponsesReplay } from "./responses-types";
export { collectResponsesEvents } from "./responses-stream-events";
export { streamResponsesPrototype } from "./responses-stream";

const tools = [
  {
    name: providerToolName,
    description: javascriptToolDescription,
    parameters: javascriptToolParameters,
  },
  ...localToolDefinitions,
].map((fn) => ({ type: "function", ...fn, strict: false }));

export function replay(
  items: readonly OutputItem[],
  results: readonly ExecutionResult[],
) {
  let size = 0;
  const calls = new Set<string>();
  const output: object[] = [];
  for (const item of items) {
    const bytes = JSON.stringify(item);
    size += bytes.length;
    if (size > maxToolReplayChars) throw invalid();
    if (item.type === "reasoning") {
      if (
        typeof item.id !== "string" ||
        !Array.isArray(item.summary) ||
        typeof item.encrypted_content !== "string" ||
        !item.encrypted_content
      )
        throw invalid();
      output.push({
        type: "reasoning",
        id: item.id,
        summary: item.summary,
        encrypted_content: item.encrypted_content,
      });
    } else if (item.type === "function_call") {
      if (
        typeof item.call_id !== "string" ||
        !item.call_id ||
        calls.has(item.call_id) ||
        typeof item.name !== "string" ||
        !item.name ||
        typeof item.arguments !== "string" ||
        item.arguments.length > executionLimits.sourceChars * 6 + 256
      )
        throw invalid();
      calls.add(item.call_id);
      output.push({
        type: "function_call",
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      });
    } else if (item.type === "message") {
      if (item.role !== "assistant" || !Array.isArray(item.content))
        throw invalid();
      output.push({
        type: "message",
        role: "assistant",
        content: item.content,
      });
    } else throw invalid();
  }
  if (calls.size !== results.length || calls.size > toolTurnLimits.calls)
    throw invalid();
  [...calls].forEach((call_id, i) =>
    output.push({
      type: "function_call_output",
      call_id,
      output: JSON.stringify(results[i]),
    }),
  );
  return output;
}

export function validResponsesReplay(value: unknown): value is ResponsesReplay {
  try {
    const data = record(value);
    if (!data || !Array.isArray(data.exchanges) || !Array.isArray(data.final) || data.exchanges.length > toolTurnLimits.rounds || JSON.stringify(data).length > maxToolReplayChars * 4) return false;
    for (const exchange of data.exchanges) {
      const item = record(exchange);
      if (!item || !Array.isArray(item.items) || !Array.isArray(item.results)) return false;
      replay(item.items, item.results);
    }
    replay(data.final, []);
    return true;
  } catch { return false; }
}

/** Builds only stateless requests; user-selected active branch must be supplied by the caller. */
export function buildResponsesRequest(
  model: string,
  history: readonly Message[],
  options?: {
    allowCalls: boolean;
    exchanges: readonly ResponsesExchange[];
    requestSummary?: boolean;
  },
  requestSummary = false,
  effort: import("./reasoning-effort").ReasoningEffort = "default",
) {
  const completed: Message[] = [];
  for (const message of history) {
    if (message.role !== "user" && message.status !== "complete") continue;
    if (message.role === "assistant" && completed.at(-1)?.role === "assistant")
      completed[completed.length - 1] = message;
    else completed.push(message);
  }
  const input: object[] = completed.flatMap((message) => {
    if (message.role === "assistant" && message.responsesReplay) {
      if (!validResponsesReplay(message.responsesReplay)) throw invalid();
      return [...message.responsesReplay.exchanges.flatMap((exchange) => replay(exchange.items, exchange.results)), ...replay(message.responsesReplay.final, [])];
    }
    const text =
      message.content +
      (message.attachments || [])
        .filter((file) => file.mime.startsWith("text/"))
        .map((file) => `\n\nFile: ${file.name}\n${file.data}`)
        .join("");
    const images = (message.attachments || []).filter((file) =>
      file.mime.startsWith("image/"),
    );
    return [{
      role: message.role,
      content: images.length
        ? [
            { type: "input_text", text },
            ...images.map((file) => ({
              type: "input_image",
              image_url: file.data,
              detail: "auto",
            })),
          ]
        : text,
    }];
  });
  const seenCallIds = new Set<string>();
  for (const exchange of options?.exchanges || []) {
    const next = replay(exchange.items, exchange.results);
    for (const item of exchange.items) {
      if (item.type !== "function_call") continue;
      const id = item.call_id as string;
      if (seenCallIds.has(id)) throw invalid();
      seenCallIds.add(id);
    }
    input.push(...next);
  }
  return {
    model,
    input,
    stream: true,
    store: false,
    include: ["reasoning.encrypted_content"],
    ...(options ? { tools, tool_choice: options.allowCalls ? "auto" : "none" } : {}),
    ...((options?.requestSummary || requestSummary || effort !== "default") ? { reasoning: { ...((options?.requestSummary || requestSummary) ? { summary: "auto" } : {}), ...(effort !== "default" ? { effort } : {}) } } : {}),
  };
}
