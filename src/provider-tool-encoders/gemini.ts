import { providerToolDefinitions } from "./definitions";
import type { ToolRequest } from "../provider-tool-types";

export function geminiToolFields(tool: ToolRequest | undefined) {
  if (!tool) return { options: {}, tail: [] };
  return {
    options: {
      tools: [{ functionDeclarations: providerToolDefinitions }],
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
