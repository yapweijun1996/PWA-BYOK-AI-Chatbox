import type { StreamContext, StreamDecoder } from "./types";

export function createAnthropicDecoder({ emitText, onReasoning, collector }: StreamContext): StreamDecoder {
  const blocks = new Map<number, number>();
  return {
    push(chunk) {
      if (chunk.type === "content_block_start" && chunk.content_block?.type === "text" && typeof chunk.content_block.text === "string")
        emitText(chunk.content_block.text);
      if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
        const index = blocks.size;
        blocks.set(chunk.index, index);
        collector?.openAI([{ index, id: chunk.content_block.id, type: "function", function: { name: chunk.content_block.name } }]);
      } else if (chunk.type === "content_block_delta") {
        if (chunk.delta?.type === "text_delta" && typeof chunk.delta.text === "string") emitText(chunk.delta.text);
        if (chunk.delta?.type === "input_json_delta" && blocks.has(chunk.index))
          collector?.openAI([{ index: blocks.get(chunk.index), function: { arguments: chunk.delta.partial_json } }]);
        if (chunk.delta?.type === "thinking_delta" && typeof chunk.delta.thinking === "string") onReasoning(chunk.delta.thinking);
      }
      return chunk.type === "message_stop";
    },
  };
}
