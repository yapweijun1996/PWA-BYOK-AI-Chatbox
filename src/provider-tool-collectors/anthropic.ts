import type { createOpenAIToolCollector } from "./openai-compatible";

/** Convert Anthropic block indexes to the indexed call representation. */
export function createAnthropicToolCollector(openai: ReturnType<typeof createOpenAIToolCollector>) {
  const blocks = new Map<number, number>();
  return {
    start(blockIndex: number, id: unknown, name: unknown) {
      const index = blocks.size;
      blocks.set(blockIndex, index);
      openai.push([{ index, id, type: "function", function: { name } }]);
    },
    delta(blockIndex: number, partial: unknown) {
      if (blocks.has(blockIndex)) openai.push([{ index: blocks.get(blockIndex), function: { arguments: partial } }]);
    },
  };
}
