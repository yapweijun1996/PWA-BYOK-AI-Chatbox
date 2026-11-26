import { responsesStreamFailure } from "./responses-errors";
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
import { parseEventStream } from "./event-stream";

/** Responses output is kept in order and bounded before any local tool is run. */
export type OutputItem = Record<string, unknown> & { type: string };
export type ResponsesExchange = {
  items: readonly OutputItem[];
  results: readonly ExecutionResult[];
};
export type ResponsesReplay = { exchanges: ResponsesExchange[]; final: OutputItem[] };
const record = (x: unknown): Record<string, unknown> | undefined =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : undefined;
const invalid = () =>
  new Error(
    "Responses API data is invalid or exceeds the supported size. Check model compatibility and retry.",
  );
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

/** The caller feeds parsed SSE data and handles aborts; no tool runs until finish succeeds. */
export function collectResponsesEvents(
  onText: (text: string) => void,
  onSummary: (text: string) => void,
) {
  const items = new Map<number, OutputItem>();
  const seen = new Set<number>();
  let completed = false;
  let received = false;
  let total = 0;
  let usage: unknown;
  const acceptItem = (index: unknown, value: unknown) => {
    const item = record(value);
    if (
      !Number.isSafeInteger(index) ||
      (index as number) < 0 ||
      !item ||
      typeof item.type !== "string"
    )
      throw invalid();
    const encoded = JSON.stringify(item);
    total += encoded.length;
    if (total > maxToolReplayChars || items.has(index as number))
      throw invalid();
    items.set(index as number, item as OutputItem);
  };
  return {
    push(value: unknown) {
      const event = record(value);
      if (!event || typeof event.type !== "string" || completed)
        throw invalid();
      if (typeof event.sequence_number === "number") {
        if (
          !Number.isSafeInteger(event.sequence_number) ||
          event.sequence_number < 0 ||
          seen.has(event.sequence_number)
        )
          throw invalid();
        seen.add(event.sequence_number);
        if (seen.size > 100_000) throw invalid();
      }
      if (
        event.type === "response.output_text.delta" ||
        event.type === "response.reasoning_summary_text.delta"
      ) {
        if (typeof event.delta !== "string") throw invalid();
        if (event.type === "response.output_text.delta")
          received ||= Boolean(event.delta);
        (event.type === "response.output_text.delta" ? onText : onSummary)(
          event.delta,
        );
      } else if (event.type === "response.output_item.done")
        acceptItem(event.output_index, event.item);
      else if (
        event.type === "response.failed" ||
        event.type === "response.incomplete" ||
        event.type === "error"
      )
        throw new Error(responsesStreamFailure(event));
      else if (event.type === "response.completed") {
        const response = record(event.response);
        if (
          !response ||
          response.status !== "completed" ||
          !Array.isArray(response.output)
        )
          throw invalid();
        const finalOutput = response.output;
        for (const [index, item] of finalOutput.entries()) {
          const finalItem = record(item);
          const streamedItem = items.get(index);
          if (!finalItem || typeof finalItem.type !== "string") throw invalid();
          if (
            streamedItem &&
            (streamedItem.type !== finalItem.type ||
              streamedItem.id !== finalItem.id ||
              streamedItem.call_id !== finalItem.call_id ||
              streamedItem.name !== finalItem.name ||
              streamedItem.arguments !== finalItem.arguments ||
              streamedItem.encrypted_content !== finalItem.encrypted_content)
          )
            throw invalid();
          if (!streamedItem) acceptItem(index, item);
        }
        if ([...items.keys()].some((index) => index >= finalOutput.length))
          throw invalid();
        usage = response.usage;
        completed = true;
      }
    },
    finish() {
      if (!completed)
        throw new Error(
          "The response was interrupted before completion. Partial output was retained.",
        );
      const output = [...items.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, item]) => item);
      const calls = output.filter((item) => item.type === "function_call");
      if (calls.length > toolTurnLimits.calls) throw invalid();
      const ids = new Set<string>();
      for (const call of calls) {
        if (
          typeof call.call_id !== "string" ||
          !call.call_id ||
          ids.has(call.call_id) ||
          typeof call.name !== "string" ||
          !call.name ||
          typeof call.arguments !== "string" ||
          call.arguments.length > executionLimits.sourceChars * 6 + 256
        )
          throw invalid();
        ids.add(call.call_id);
      }
      if (!received && !calls.length)
        throw new Error(
          "The provider returned no text. Check model compatibility or safety filters.",
        );
      return {
        output,
        calls: calls.map((item) => ({
          id: item.call_id as string,
          name: item.name as string,
          arguments: item.arguments as string,
        })),
        usage,
      };
    },
  };
}

/** Transport is injected so tests and callers control credentials, endpoint and network policy. */
export async function streamResponsesPrototype(
  send: (body: object, signal: AbortSignal) => Promise<Response>,
  body: object,
  signal: AbortSignal,
  onText: (text: string) => void,
  onSummary: (text: string) => void,
) {
  signal.throwIfAborted();
  const response = await send(body, signal);
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}.`);
  if (!response.body)
    throw new Error("The provider returned an empty response.");
  const collector = collectResponsesEvents(onText, onSummary);
  await parseEventStream(response.body, (data) => {
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error(
        "The provider returned invalid streaming data. Partial output was retained.",
      );
    }
    collector.push(event);
  });
  signal.throwIfAborted();
  return collector.finish();
}
