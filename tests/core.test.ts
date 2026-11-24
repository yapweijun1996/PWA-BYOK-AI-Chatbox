import { describe, expect, it, vi } from "vitest";
import {
  buildRequest,
  listModels,
  parseEventStream,
  streamChat,
} from "../src/providers";
import { mergeSettings, validBackup } from "../src/data-contracts";
import { encryptSecret, decryptSecret } from "../src/crypto";
import { defaultSettings } from "../src/types";
import type { Message, Settings } from "../src/types";
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
  it("adds OpenRouter to old settings without changing saved provider configuration or keys", () => {
    const old = {
      provider: "openai",
      theme: "dark",
      providers: {
        openai: { ...defaultSettings.providers.openai, model: "old-model" },
        lmstudio: {
          ...defaultSettings.providers.lmstudio,
          endpoint: "http://localhost:9999/v1",
        },
      },
      vaults: {
        openai: {
          version: 1,
          salt: "s",
          iv: "i",
          data: "ciphertext",
          iterations: 600000,
        },
      },
    } as unknown as Settings;
    const restored = mergeSettings(old);
    expect(restored.providers.openrouter.endpoint).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(restored.providers.openai.model).toBe("old-model");
    expect(restored.providers.lmstudio.endpoint).toBe(
      "http://localhost:9999/v1",
    );
    expect(restored.vaults.openai).toEqual(old.vaults.openai);
  });
  it("recognizes legacy backup conversations without reasoning", () => {
    expect(
      validBackup({
        version: 1,
        conversations: [
          {
            id: "c",
            title: "Old",
            updatedAt: 1,
            draft: "",
            messages: [
              { id: "m", role: "user", content: "hello", createdAt: 1 },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
  it("uses the fixed OpenRouter endpoint and maps the model catalog", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: "thinkingmachines/inkling-2-mini" }] }),
          { status: 200 },
        ),
      );
    const config = {
      ...defaultSettings.providers.openrouter,
      endpoint: "https://untrusted.example/v1",
    };
    expect(await listModels(config, "example-key")).toEqual([
      "thinkingmachines/inkling-2-mini",
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/models",
    );
    fetchMock.mockRestore();
  });
  it("requests OpenRouter reasoning only when explicitly enabled", () => {
    const config = {
      ...defaultSettings.providers.openrouter,
      model: "example/model",
    };
    expect(JSON.stringify(buildRequest(config, [message]).body)).not.toContain(
      '"reasoning"',
    );
    expect(
      JSON.stringify(
        buildRequest({ ...config, requestThoughts: true }, [message]).body,
      ),
    ).toContain('"reasoning":{"enabled":true}');
  });
  it("does not display invalid stream payloads as errors", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(stream(["data: confidential-payload\n\n"]), {
          status: 200,
        }),
      );
    try {
      await expect(
        streamChat(
          { ...defaultSettings.providers.openrouter, model: "example/model" },
          "example-key",
          [message],
          new AbortController().signal,
          () => {},
        ),
      ).rejects.toThrow("invalid streaming data");
    } finally {
      fetchMock.mockRestore();
    }
  });
  it.each([
    [401, "Authentication"],
    [402, "credit"],
    [403, "Access denied"],
    [404, "not found"],
    [429, "Rate limit"],
  ])(
    "reports actionable HTTP %i without leaking provider response",
    async (status, expected) => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response('{"error":"private-example"}', { status }),
        );
      try {
        await expect(
          listModels(defaultSettings.providers.openrouter, "example-key"),
        ).rejects.toThrow(expected);
      } finally {
        fetchMock.mockRestore();
      }
    },
  );
  it("streams OpenRouter reasoning details and does not duplicate mirrored reasoning", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          stream([
            'data: {"choices":[{"delta":{"reasoning":"one","reasoning_details":[{"type":"reasoning.text","text":"one"}]}}]}\n\n',
            'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.summary","summary":" two"},{"type":"reasoning.encrypted","data":"opaque"}]}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n',
          ]),
          { status: 200 },
        ),
      );
    let answer = "",
      reasoning = "";
    await streamChat(
      { ...defaultSettings.providers.openrouter, model: "example/model" },
      "example-key",
      [message],
      new AbortController().signal,
      (text) => {
        answer += text;
      },
      (text) => {
        reasoning += text;
      },
    );
    expect(reasoning).toBe("one two");
    expect(answer).toBe("answer");
    fetchMock.mockRestore();
  });
  it.each(["length", "error", "content_filter"])(
    "retains partial output when finish reason is %s",
    async (finishReason) => {
      const event = JSON.stringify({
        choices: [
          { delta: { content: "partial" }, finish_reason: finishReason },
        ],
      });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(stream([`data: ${event}\n\n`]), { status: 200 }),
        );
      let answer = "";
      try {
        await expect(
          streamChat(
            { ...defaultSettings.providers.openrouter, model: "example/model" },
            "example-key",
            [message],
            new AbortController().signal,
            (text) => {
              answer += text;
            },
          ),
        ).rejects.toThrow();
        expect(answer).toBe("partial");
      } finally {
        fetchMock.mockRestore();
      }
    },
  );
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
