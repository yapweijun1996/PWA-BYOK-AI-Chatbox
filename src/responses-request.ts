import { responsesTools as tools } from "./provider-tool-encoders/responses";
import { invalid, type ResponsesExchange } from "./responses-types";
import { replay, validResponsesReplay } from "./responses-replay";
import type { Message } from "./types";

/** Builds only stateless requests; user-selected active branch must be supplied by the caller. */
export function buildResponsesRequest(
  model: string,
  history: readonly Message[],
  options?: {
    allowCalls: boolean;
    exchanges: readonly ResponsesExchange[];
    requestSummary?: boolean;
  },
  requestSummary = false,
  effort: import("./reasoning-effort").ReasoningEffort = "default",
) {
  const completed: Message[] = [];
  for (const message of history) {
    if (message.role !== "user" && message.status !== "complete") continue;
    if (message.role === "assistant" && completed.at(-1)?.role === "assistant")
      completed[completed.length - 1] = message;
    else completed.push(message);
  }
  const input: object[] = completed.flatMap((message) => {
    if (message.role === "assistant" && message.responsesReplay) {
      if (!validResponsesReplay(message.responsesReplay)) throw invalid();
      return [...message.responsesReplay.exchanges.flatMap((exchange) => replay(exchange.items, exchange.results)), ...replay(message.responsesReplay.final, [])];
    }
    const text =
      message.content +
      (message.attachments || [])
        .filter((file) => file.mime.startsWith("text/"))
        .map((file) => `\n\nFile: ${file.name}\n${file.data}`)
        .join("");
    const images = (message.attachments || []).filter((file) =>
      file.mime.startsWith("image/"),
    );
    return [{
      role: message.role,
      content: images.length
        ? [
            { type: "input_text", text },
            ...images.map((file) => ({
              type: "input_image",
              image_url: file.data,
              detail: "auto",
            })),
          ]
        : text,
    }];
  });
  const seenCallIds = new Set<string>();
  for (const exchange of options?.exchanges || []) {
    const next = replay(exchange.items, exchange.results);
    for (const item of exchange.items) {
      if (item.type !== "function_call") continue;
      const id = item.call_id as string;
      if (seenCallIds.has(id)) throw invalid();
      seenCallIds.add(id);
    }
    input.push(...next);
  }
  return {
    model,
    input,
    stream: true,
    store: false,
    include: ["reasoning.encrypted_content"],
    ...(options ? { tools, tool_choice: options.allowCalls ? "auto" : "none" } : {}),
    ...((options?.requestSummary || requestSummary || effort !== "default") ? { reasoning: { ...((options?.requestSummary || requestSummary) ? { summary: "auto" } : {}), ...(effort !== "default" ? { effort } : {}) } } : {}),
  };
}
