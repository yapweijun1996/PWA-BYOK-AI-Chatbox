import { javascriptToolDescription, javascriptToolParameters, providerToolName } from "./javascript-tool";
import { localToolDefinitions } from "./tool-definitions";
import type { ToolRequest } from "./provider-tool-types";

const definition = { name: providerToolName, description: javascriptToolDescription, parameters: javascriptToolParameters };

export function anthropicToolFields(tool: ToolRequest | undefined) {
  if (!tool) return { options: {}, tail: [] };
  return {
    options: {
      tools: [definition, ...localToolDefinitions].map(
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

export function openAIToolFields(
  tool: ToolRequest | undefined,
  openRouter: boolean,
) {
  if (!tool) return { options: {}, tail: [] };
  return {
    options: {
      tools: [definition, ...localToolDefinitions].map((fn) => ({
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

export function geminiToolFields(tool: ToolRequest | undefined) {
  if (!tool) return { options: {}, tail: [] };
  return {
    options: {
      tools: [{ functionDeclarations: [definition, ...localToolDefinitions] }],
      toolConfig: {
        functionCallingConfig: { mode: tool.allowCalls ? "AUTO" : "NONE" },
      },
    },
    tail: tool.exchanges.flatMap(({ round, results }) => [
      { role: "model", parts: round.geminiParts },
      {
        role: "user",
        parts: round.geminiParts
          .flatMap(({ functionCall }) => (functionCall ? [functionCall] : []))
          .map(({ id, name }, index) => ({
            functionResponse: {
              ...(id ? { id } : {}),
              name,
              response: results[index],
            },
          })),
      },
    ]),
  };
}

