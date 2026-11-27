import type { ToolCall } from "./javascript-tool";
import type { ExecutionResult } from "./js-tool-runtime";

export const maxToolReplayChars = 96 * 1024;
export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args: Record<string, unknown> };
};
export type ToolRound = Readonly<{
  calls: readonly ToolCall[];
  text: string;
  geminiParts: readonly GeminiPart[];
  reasoningDetails: readonly unknown[];
  responsesItems?: readonly import("./responses-types").OutputItem[];
}>;
export type ToolExchange = Readonly<{
  round: ToolRound;
  results: readonly ExecutionResult[];
}>;
export type ToolRequest = Readonly<{
  allowCalls: boolean;
  exchanges: readonly ToolExchange[];
}>;

