import { providerToolDefinitions } from "./definitions";
import type { ToolRequest } from "../provider-tool-types";

export function anthropicToolFields(tool: ToolRequest | undefined) {
  if (!tool) return { options: {}, tail: [] };
  return {
    options: {
      tools: providerToolDefinitions.map(
        ({ name, description, parameters }) => ({
          name,
          description,
          input_schema: parameters,
        }),
      ),
      tool_choice: { type: tool.allowCalls ? "auto" : "none" },
    },
    tail: tool.exchanges.flatMap(({ round, results }) => [
      {
        role: "assistant",
        content: [
          ...(round.text ? [{ type: "text", text: round.text }] : []),
          ...round.calls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: JSON.parse(call.arguments || "{}"),
          })),
        ],
      },
      {
        role: "user",
        content: round.calls.map((call, index) => ({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(results[index]),
        })),
      },
    ]),
  };
}
