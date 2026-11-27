import { providerToolDefinitions } from "./definitions";
import type { ToolRequest } from "../provider-tool-types";

export function openAIToolFields(
  tool: ToolRequest | undefined,
  openRouter: boolean,
) {
  if (!tool) return { options: {}, tail: [] };
  return {
    options: {
      tools: providerToolDefinitions.map((fn) => ({
        type: "function",
        function: fn,
      })),
      tool_choice: tool.allowCalls ? "auto" : "none",
    },
    tail: tool.exchanges.flatMap(({ round, results }) => [
      {
        role: "assistant",
        content: round.text || null,
        tool_calls: round.calls.map(({ id, name, arguments: args }) => ({
          id,
          type: "function",
          function: { name, arguments: args },
        })),
        ...(openRouter && round.reasoningDetails.length
          ? { reasoning_details: round.reasoningDetails }
          : {}),
      },
      ...round.calls.map((call, index) => ({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(results[index]),
      })),
    ]),
  };
}
