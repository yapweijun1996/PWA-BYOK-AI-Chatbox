import { describe, expect, it, vi } from "vitest";
import { buildRequest, parseEventStream, streamChat } from "../src/providers";
import { encryptSecret, decryptSecret } from "../src/crypto";
import { defaultSettings } from "../src/types";
import type { Message } from "../src/types";
const message: Message = {
  id: "m",
  role: "user",
  content: "Hello",
  createdAt: 1,
  attachments: [
    { id: "a", name: "notes.txt", mime: "text/plain", size: 3, data: "abc" },
  ],
};
const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
describe("provider contracts", () => {
  it("parses split SSE events, CRLF, UTF-8 and final event without trailing newline", async () => {
    const out: string[] = [];
    await parseEventStream(
      stream([
        'data: {"v":"a',
        '"}\r\n\r\ndata: {"v":"b"}\n\n',
        'data: [DONE]\n\ndata: {"v":"c"}',
      ]),
      (x) => out.push(x),
    );
    expect(out.map((x) => JSON.parse(x).v)).toEqual(["a", "b", "c"]);
  });
  it("builds separate Gemini and OpenAI-compatible requests with text attachments", () => {
    const a = buildRequest(
      { ...defaultSettings.providers.lmstudio, model: "local" },
      [message],
    );
    expect(a.path).toBe("/chat/completions");
    expect(JSON.stringify(a.body)).toContain("File: notes.txt");
    const b = buildRequest(
      { ...defaultSettings.providers.gemini, model: "test-model" },
      [message],
    );
    expect(b.path).toContain("streamGenerateContent?alt=sse");
    expect(JSON.stringify(b.body)).toContain("File: notes.txt");
  });
  it("reads model chunks and does not send a key when LM Studio has none", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          stream([
            'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        ),
      );
    let output = "";
    await streamChat(
      { ...defaultSettings.providers.lmstudio, model: "local" },
      "",
      [message],
      new AbortController().signal,
      (t) => (output += t),
    );
    expect(output).toBe("Hi");
    expect(
      (fetchMock.mock.calls[0][1]?.headers as Record<string, string>)
        .Authorization,
    ).toBeUndefined();
    fetchMock.mockRestore();
  });
  it("rejects unsupported image input before sending a request", async () => {
    const m = {
      ...message,
      attachments: [
        {
          id: "i",
          name: "image.png",
          mime: "image/png",
          size: 1,
          data: "data:image/png;base64,AA==",
        },
      ],
    };
    await expect(
      streamChat(
        { ...defaultSettings.providers.lmstudio, model: "local" },
        "",
        [m],
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("image support");
  });
  it("retains partial text and reports an incomplete stream", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          stream(['data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n']),
          { status: 200 },
        ),
      );
    let output = "";
    await expect(
      streamChat(
        { ...defaultSettings.providers.lmstudio, model: "local" },
        "",
        [message],
        new AbortController().signal,
        (text) => {
          output += text;
        },
      ),
    ).rejects.toThrow("interrupted");
    expect(output).toBe("Partial");
    fetchMock.mockRestore();
  });
});
describe("encrypted keys", () => {
  it("round trips with the right password and rejects the wrong password", async () => {
    const encrypted = await encryptSecret(
      "private-test-key",
      "correct horse battery staple",
    );
    expect(JSON.stringify(encrypted)).not.toContain("private-test-key");
    await expect(decryptSecret(encrypted, "wrong")).rejects.toThrow(
      "Could not unlock",
    );
    expect(await decryptSecret(encrypted, "correct horse battery staple")).toBe(
      "private-test-key",
    );
  });
});
