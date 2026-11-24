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
  it("streams LM Studio reasoning fields without adding them to the answer", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          stream([
            'data: {"choices":[{"delta":{"reasoning_content":"First "}}]}\n\n',
            'data: {"choices":[{"delta":{"reasoning":"second"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        ),
      );
    let answer = "",
      reasoning = "";
    await streamChat(
      { ...defaultSettings.providers.lmstudio, model: "local" },
      "",
      [message],
      new AbortController().signal,
      (text) => {
        answer += text;
      },
      (text) => {
        reasoning += text;
      },
    );
    expect(reasoning).toBe("First second");
    expect(answer).toBe("Answer");
    fetchMock.mockRestore();
  });
  it("handles local think tags split across chunks and preserves plain text", async () => {
    const chunks = ["<th", "ink>Plan", " carefully</th", "ink>Final"];
    const events = chunks.map(
      (text) =>
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(stream([...events, "data: [DONE]\n\n"]), { status: 200 }),
      );
    let answer = "",
      reasoning = "";
    await streamChat(
      { ...defaultSettings.providers.lmstudio, model: "local" },
      "",
      [message],
      new AbortController().signal,
      (text) => {
        answer += text;
      },
      (text) => {
        reasoning += text;
      },
    );
    expect(reasoning).toBe("Plan carefully");
    expect(answer).toBe("Final");
    fetchMock.mockRestore();
  });
  it("requests Gemini summaries only when enabled and separates thought parts", async () => {
    const config = {
      ...defaultSettings.providers.gemini,
      model: "model",
      requestThoughts: true,
    };
    expect(JSON.stringify(buildRequest(config, [message]).body)).toContain(
      '"includeThoughts":true',
    );
    expect(
      JSON.stringify(
        buildRequest({ ...config, requestThoughts: false }, [message]).body,
      ),
    ).not.toContain("includeThoughts");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          stream([
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"Summary"},{"text":"Answer"}]},"finishReason":"STOP"}]}\n\n',
          ]),
          { status: 200 },
        ),
      );
    let answer = "",
      reasoning = "";
    await streamChat(
      config,
      "mock-key",
      [message],
      new AbortController().signal,
      (text) => {
        answer += text;
      },
      (text) => {
        reasoning += text;
      },
    );
    expect(reasoning).toBe("Summary");
    expect(answer).toBe("Answer");
    fetchMock.mockRestore();
  });
  it("does not include stored reasoning in subsequent model requests", () => {
    const prior: Message = {
      id: "a",
      role: "assistant",
      content: "Visible answer",
      reasoning: "Private reasoning",
      status: "complete",
      createdAt: 1,
    };
    for (const config of [
      defaultSettings.providers.lmstudio,
      defaultSettings.providers.gemini,
    ]) {
      const body = JSON.stringify(buildRequest(config, [message, prior]).body);
      expect(body).toContain("Visible answer");
      expect(body).not.toContain("Private reasoning");
    }
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
