import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRequest,
  listModelOptions,
  requestHistory,
  streamChat,
} from "../src/providers";
import { defaultSettings } from "../src/types";
import { mergeSettings } from "../src/data-contracts";
import type { Message } from "../src/types";

const config = {
  ...defaultSettings.providers.anthropic,
  model: "claude-test",
  vision: true,
};
const user: Message = {
  id: "u",
  role: "user",
  content: "Hello",
  createdAt: 1,
  attachments: [
    {
      id: "image",
      name: "a.png",
      mime: "image/png",
      size: 1,
      data: "data:image/png;base64,YQ==",
    },
    { id: "file", name: "a.txt", mime: "text/plain", size: 1, data: "x" },
  ],
};
const events = (values: unknown[]) =>
  new Response(
    values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
afterEach(() => vi.unstubAllGlobals());

describe("Anthropic browser API", () => {
  it("adds Anthropic to older settings and builds native image and text messages", () => {
    const settings = mergeSettings({ provider: "openai" });
    expect(settings.providers.anthropic.endpoint).toBe(
      "https://api.anthropic.com/v1",
    );
    const request = buildRequest(config, [user]);
    expect(request.path).toBe("/messages");
    expect(request.body).toMatchObject({
      model: "claude-test",
      stream: true,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello\n\nFile: a.txt\nx" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "YQ==" },
            },
          ],
        },
      ],
    });
  });
  it("uses direct browser headers and parses streaming text and usage", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        events([
          {
            type: "message_start",
            message: { model: "claude-served", usage: { input_tokens: 9 } },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hi" },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 2 },
          },
          { type: "message_stop" },
        ]),
      );
    vi.stubGlobal("fetch", fetch);
    let text = "";
    const samples: unknown[] = [];
    await streamChat(
      config,
      "secret",
      [user],
      new AbortController().signal,
      (value) => (text += value),
      () => {},
      (sample) => samples.push(sample),
    );
    expect(text).toBe("Hi");
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      "x-api-key": "secret",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(samples).toContainEqual(
      expect.objectContaining({ usage: expect.objectContaining({ input: 9 }) }),
    );
    expect(samples).toContainEqual(
      expect.objectContaining({
        usage: expect.objectContaining({ output: 2 }),
      }),
    );
  });
  it("replays native streamed tool calls and results", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        events([
          {
            type: "content_block_start",
            index: 1,
            content_block: {
              type: "tool_use",
              id: "tool-1",
              name: "javascript_execute",
              input: {},
            },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: '{"code":"1+1"}' },
          },
          { type: "message_delta", delta: { stop_reason: "tool_use" } },
          { type: "message_stop" },
        ]),
      );
    vi.stubGlobal("fetch", fetch);
    const round = await streamChat(
      config,
      "secret",
      [user],
      new AbortController().signal,
      () => {},
      () => {},
      undefined,
      { allowCalls: true, exchanges: [] },
    );
    expect(round?.calls).toEqual([
      { id: "tool-1", name: "javascript_execute", arguments: '{"code":"1+1"}' },
    ]);
    const body = buildRequest(config, [user], {
      allowCalls: false,
      exchanges: [
        {
          round: round!,
          results: [
            {
              status: "success",
              durationMs: 1,
              truncated: false,
              console: [],
              value: { format: "json", text: "2" },
            },
          ],
        },
      ],
    }).body;
    expect(body).toMatchObject({
      tool_choice: { type: "none" },
      messages: [
        { role: "user" },
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "tool-1", input: { code: "1+1" } }],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool-1" }],
        },
      ],
    });
  });
  it("parses the model catalog and retains only the latest consecutive answer in subsequent context", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              data: [{ id: "claude-test", display_name: "Claude Test" }],
            }),
          ),
        ),
    );
    await expect(listModelOptions(config, "key")).resolves.toEqual([
      { id: "claude-test", name: "Claude Test" },
    ]);
    const a: Message = {
      id: "a",
      role: "assistant",
      content: "old",
      createdAt: 2,
      status: "complete",
    };
    const b: Message = { ...a, id: "b", content: "new" };
    expect(requestHistory([user, a, b])).toEqual([user, b]);
  });
});
