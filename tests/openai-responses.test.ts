import { describe, expect, it } from "vitest";
import {
  buildResponsesRequest,
  collectResponsesEvents,
  streamResponsesPrototype,
} from "../src/openai-responses";
import type { Message } from "../src/types";
const message: Message = {
  id: "u",
  role: "user",
  content: "Calculate",
  createdAt: 1,
};
const result = {
  status: "success",
  durationMs: 0,
  console: [],
  truncated: false,
  value: { format: "json", text: "2" },
} as const;
const reasoning = {
  type: "reasoning",
  id: "rs_1",
  summary: [],
  encrypted_content: "opaque",
};
const call = {
  type: "function_call",
  call_id: "call_1",
  name: "calculate",
  arguments: '{"expression":"1+1"}',
};

describe("OpenAI Responses protocol prototype", () => {
  it("handles fragmented SSE transport and carries completed tool calls into the next request", async () => {
    const events = [
      {
        type: "response.output_item.done",
        sequence_number: 1,
        output_index: 0,
        item: reasoning,
      },
      {
        type: "response.output_item.done",
        sequence_number: 2,
        output_index: 1,
        item: call,
      },
      {
        type: "response.completed",
        sequence_number: 3,
        response: { status: "completed", output: [reasoning, call] },
      },
    ];
    const encoded = new TextEncoder().encode(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
        "data: [DONE]\n\n",
    );
    const send = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (let index = 0; index < encoded.length; index += 7)
              controller.enqueue(encoded.slice(index, index + 7));
            controller.close();
          },
        }),
        { status: 200 },
      );
    const output = await streamResponsesPrototype(
      send,
      {},
      new AbortController().signal,
      () => {},
      () => {},
    );
    expect(output.calls).toHaveLength(1);
    expect(
      buildResponsesRequest("gpt-6-luna", [message], {
        allowCalls: true,
        exchanges: [{ items: output.output, results: [result] }],
      }).input.at(-1),
    ).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: JSON.stringify(result),
    });
    const stopped = new AbortController();
    stopped.abort();
    await expect(
      streamResponsesPrototype(
        send,
        {},
        stopped.signal,
        () => {},
        () => {},
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("builds a stateless request and preserves ordered reasoning and matching function results", () => {
    const body = buildResponsesRequest("gpt-6-luna", [message], {
      allowCalls: true,
      exchanges: [{ items: [reasoning, call], results: [result] }],
      requestSummary: true,
    });
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      reasoning: { summary: "auto" },
      input: [
        { role: "user", content: "Calculate" },
        reasoning,
        call,
        {
          type: "function_call_output",
          call_id: "call_1",
          output: JSON.stringify(result),
        },
      ],
    });
    expect(body.tools?.map((x) => x.name)).toEqual([
      "javascript_execute",
      "time_tool",
      "calculate",
      "analyze_file",
      "text_tool",
      "memory_tool",
    ]);
    expect(body).not.toHaveProperty("previous_response_id");
  });
  it("retains only completed visible history and maps local text and images", () => {
    const history: Message[] = [
      message,
      {
        id: "f",
        role: "assistant",
        content: "failed",
        status: "error",
        createdAt: 2,
      },
      {
        id: "i",
        role: "user",
        content: "Look",
        createdAt: 3,
        attachments: [
          {
            id: "x",
            name: "a.png",
            mime: "image/png",
            size: 1,
            data: "data:image/png;base64,AA==",
          },
        ],
      },
    ];
    const body = buildResponsesRequest("m", history);
    expect(body.input).toEqual([
      { role: "user", content: "Calculate" },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Look" },
          {
            type: "input_image",
            image_url: "data:image/png;base64,AA==",
            detail: "auto",
          },
        ],
      },
    ]);
    expect(body).not.toHaveProperty("tools");
  });
  it("collects streamed text, summaries and completed tool items without executing them", () => {
    let text = "",
      summary = "";
    const stream = collectResponsesEvents(
      (x) => (text += x),
      (x) => (summary += x),
    );
    stream.push({
      type: "response.reasoning_summary_text.delta",
      sequence_number: 1,
      delta: "Thinking",
    });
    stream.push({
      type: "response.output_text.delta",
      sequence_number: 2,
      delta: "Hello",
    });
    stream.push({
      type: "response.output_item.done",
      sequence_number: 3,
      output_index: 0,
      item: reasoning,
    });
    stream.push({
      type: "response.output_item.done",
      sequence_number: 4,
      output_index: 1,
      item: call,
    });
    stream.push({
      type: "response.completed",
      sequence_number: 5,
      response: {
        status: "completed",
        output: [reasoning, call],
        usage: { input_tokens: 5 },
      },
    });
    expect(stream.finish()).toEqual({
      output: [reasoning, call],
      calls: [
        { id: "call_1", name: "calculate", arguments: '{"expression":"1+1"}' },
      ],
      usage: { input_tokens: 5 },
    });
    expect(text).toBe("Hello");
    expect(summary).toBe("Thinking");
  });
  it("fails closed on missing encrypted reasoning, duplicate calls, errors and interrupted streams", () => {
    expect(() =>
      buildResponsesRequest("m", [message], {
        allowCalls: true,
        exchanges: [
          {
            items: [{ ...reasoning, encrypted_content: null }, call],
            results: [result],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      buildResponsesRequest("m", [message], {
        allowCalls: true,
        exchanges: [{ items: [call, call], results: [result, result] }],
      }),
    ).toThrow();
    const stream = collectResponsesEvents(
      () => {},
      () => {},
    );
    stream.push({
      type: "response.output_text.delta",
      sequence_number: 1,
      delta: "partial",
    });
    expect(() => stream.finish()).toThrow(/interrupted/);
    expect(() =>
      stream.push({
        type: "response.output_text.delta",
        sequence_number: 1,
        delta: "again",
      }),
    ).toThrow();
    const failed = collectResponsesEvents(
      () => {},
      () => {},
    );
    expect(() => failed.push({ type: "response.failed" })).toThrow(/error/);
    const altered = collectResponsesEvents(
      () => {},
      () => {},
    );
    altered.push({
      type: "response.output_item.done",
      output_index: 0,
      item: call,
    });
    expect(() =>
      altered.push({
        type: "response.completed",
        response: {
          status: "completed",
          output: [{ ...call, call_id: "different" }],
        },
      }),
    ).toThrow();
  });
});

describe("Responses application integration", () => {
  it("uses the selected branch transcript after a mocked tool turn and reload", async () => {
    const { vi } = await import("vitest");
    const { streamChat } = await import("../src/providers");
    const { runToolTurn } = await import("../src/tool-turn");
    const { mergeSettings, backupPreferences } = await import("../src/data-contracts");
    const { defaultSettings } = await import("../src/types");
    const { resolveConfig, captureRequest, validRequestSnapshot } = await import("../src/request-config");
    const settings = mergeSettings({ ...defaultSettings, provider: "openai", providers: { ...defaultSettings.providers, openai: { ...defaultSettings.providers.openai, model: "gpt-6-luna", openaiApi: "responses" } } });
    const restored = mergeSettings(backupPreferences(settings).preferences);
    const config = resolveConfig(restored).config;
    expect(config.openaiApi).toBe("responses");
    expect(validRequestSnapshot(captureRequest(resolveConfig(restored)))).toBe(true);
    const final = { type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text: "2", annotations: [] }] };
    const requests: Array<{ input: unknown[] }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      const output = requests.length === 1 ? [reasoning, call] : [final];
      const events = [
        ...(requests.length === 1 ? [] : [{ type: "response.output_text.delta", delta: "2" }]),
        { type: "response.completed", response: { status: "completed", output } },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const transcript: import("../src/openai-responses").ResponsesReplay = { exchanges: [], final: [] };
      const signal = new AbortController().signal;
      await runToolTurn(async (tool) => streamChat(config, "test-key", [message], signal, () => {}, () => {}, undefined, tool, items => { transcript.final = items; }), true, signal, () => {}, [], ({ round, results }) => {
        if (round.responsesItems) { transcript.exchanges.push({ items: round.responsesItems, results }); transcript.final = []; }
      });
      expect(requests).toHaveLength(2);
      expect(requests[1].input).toEqual(expect.arrayContaining([expect.objectContaining({ type: "function_call_output", call_id: "call_1" })]));
      const saved = JSON.parse(JSON.stringify(transcript));
      const assistant: Message = { id: "a", role: "assistant", content: "2", status: "complete", createdAt: 2, responsesReplay: saved };
      const next: Message = { id: "u2", role: "user", content: "continue", createdAt: 3 };
      const active = buildResponsesRequest(config.model, [message, assistant, next]);
      expect(active.input).toEqual(expect.arrayContaining([reasoning, call, expect.objectContaining({ type: "function_call_output", call_id: "call_1" })]));
      const otherBranch = buildResponsesRequest(config.model, [message, next]);
      expect(otherBranch.input).not.toEqual(expect.arrayContaining([reasoning]));
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("Responses failure guidance", () => {
  it("distinguishes incomplete outputs while retaining streamed text", () => {
    let text = "";
    const stream = collectResponsesEvents((part) => { text += part; }, () => {});
    stream.push({ type: "response.output_text.delta", delta: "partial" });
    expect(() => stream.push({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } })).toThrow(/output limit/);
    expect(text).toBe("partial");
    const filtered = collectResponsesEvents(() => {}, () => {});
    expect(() => filtered.push({ type: "response.incomplete", response: { incomplete_details: { reason: "content_filter" } } })).toThrow(/content policy/);
  });

  it("maps known stream errors without exposing untrusted server messages", () => {
    const stream = collectResponsesEvents(() => {}, () => {});
    expect(() => stream.push({ type: "response.failed", response: { error: { code: "insufficient_quota", message: "secret user input" } } })).toThrow(/quota or credits/);
    const unknown = collectResponsesEvents(() => {}, () => {});
    expect(() => unknown.push({ type: "error", code: "secret user input", message: "secret user input" })).toThrow("The provider reported an error while generating. Partial output was retained.");
  });

  it("handles mock HTTP errors with localized, bounded and safe guidance", async () => {
    const { vi } = await import("vitest");
    const { streamChat } = await import("../src/providers");
    const { translateNotice } = await import("../src/i18n");
    const { responsesHttpHint } = await import("../src/responses-errors");
    const config = { id: "openai" as const, model: "gpt-6-luna", endpoint: "https://api.openai.com/v1", vision: false, openaiApi: "responses" as const };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "context_length_exceeded", message: "secret user input" } }), { status: 400 })));
    try {
      const error = await streamChat(config, "fake-key", [message], new AbortController().signal, () => {}).catch((e: Error) => e);
      expect(error.message).toContain("context limit");
      expect(error.message).not.toContain("secret user input");
      expect(translateNotice("zh-CN", error.message)).toContain("上下文");
      expect(translateNotice("ms", error.message)).toContain("konteks");
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "secret user input" } }), { status: 400 })));
      await expect(streamChat(config, "fake-key", [message], new AbortController().signal, () => {})).rejects.toThrow(/Responses API request \(HTTP 400\)/);
      expect(await responsesHttpHint(new Response("x".repeat(16385), { status: 400 }))).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
});
