import type { StreamContext, StreamDecoder } from "./types";

export function createAnthropicDecoder({ emitText, onReasoning, collector }: StreamContext): StreamDecoder {
  return {
    push(chunk) {
      if (chunk.type === "content_block_start" && chunk.content_block?.type === "text" && typeof chunk.content_block.text === "string")
        emitText(chunk.content_block.text);
      if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
        collector?.anthropic.start(chunk.index, chunk.content_block.id, chunk.content_block.name);
      } else if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta" && typeof chunk.delta.text === "string") emitText(chunk.delta.text);
        if (chunk.delta?.type === "input_json_delta")
          collector?.anthropic.delta(chunk.index, chunk.delta.partial_json);
        if (chunk.delta?.type === "thinking_delta" && typeof chunk.delta.thinking === "string") onReasoning(chunk.delta.thinking);
      }
      return chunk.type === "message_stop";
    },
  };
}
