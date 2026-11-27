import { toolTurnLimits } from "./javascript-tool";
import { executionLimits, type ExecutionResult } from "./js-tool-runtime/protocol";
import { maxToolReplayChars } from "./provider-tool-types";
import { invalid, record, type OutputItem, type ResponsesReplay } from "./responses-types";

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

