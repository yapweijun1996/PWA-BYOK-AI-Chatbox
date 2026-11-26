import type { collectToolRound } from "../provider-tools";

// Provider JSON is validated at the stream boundary before dispatch.
export type StreamChunk = Record<string, any>;
export type StreamContext = {
  emitText: (text: string) => void;
  onReasoning: (text: string) => void;
  collector: ReturnType<typeof collectToolRound> | undefined;
};
export type StreamDecoder = {
  push: (chunk: StreamChunk) => boolean;
  flush?: () => void;
};
