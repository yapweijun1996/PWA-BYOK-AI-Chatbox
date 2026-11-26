import { responsesStreamFailure } from "./responses-errors";
import { toolTurnLimits } from "./javascript-tool";
import { executionLimits } from "./js-tool-runtime/protocol";
import { maxToolReplayChars } from "./provider-tools";
import { invalid, record, type OutputItem } from "./responses-types";

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

