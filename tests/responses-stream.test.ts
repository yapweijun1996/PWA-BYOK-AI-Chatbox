import { describe, expect, it } from "vitest";
import { streamResponsesPrototype } from "../src/responses-stream";

const encoded = (data: string) => new TextEncoder().encode(data);
const delta = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "partial" })}\n\n`;

describe("Responses stream transport", () => {
  it("retains emitted text and rejects malformed SSE data", async () => {
    let text = "";
    const send = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoded(delta));
        controller.enqueue(encoded("data: {broken}\n\n"));
        controller.close();
      },
    }));
    await expect(streamResponsesPrototype(send, {}, new AbortController().signal, (part) => { text += part; }, () => {}))
      .rejects.toThrow(/invalid streaming data/);
    expect(text).toBe("partial");
  });

  it("does not finish a response if cancellation occurs while reading", async () => {
    const abort = new AbortController();
    let text = "";
    const send = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoded(delta));
        controller.enqueue(encoded(`data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [] } })}\n\n`));
        controller.close();
      },
    }));
    await expect(streamResponsesPrototype(send, {}, abort.signal, (part) => { text += part; abort.abort(); }, () => {}))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(text).toBe("partial");
  });
});
