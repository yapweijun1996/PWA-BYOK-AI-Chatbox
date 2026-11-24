import { describe, expect, it } from "vitest";
import { recoverMessage, validBackup } from "../src/data-contracts";
import {
  javascriptToolName,
  providerToolName,
  validToolExecutions,
} from "../src/javascript-tool";
import { collectToolRound } from "../src/provider-tools";
import type { ToolRequest } from "../src/provider-tools";
import { buildRequest } from "../src/providers";
import { runToolTurn } from "../src/tool-turn";
import { defaultSettings, type Message } from "../src/types";

const result = {
  status: "success",
  durationMs: 0,
  console: [{ level: "log", text: "testing" }],
  truncated: false,
  value: { format: "json", text: "42" },
} as const;
const source = "21 * 2";
const history: Message[] = [
  {
    id: "question",
    content: "Calculate the value",
    createdAt: 1,
    role: "user",
  },
];

describe("provider-independent JavaScript tool calling", () => {
  it("assembles fragmented OpenAI-compatible calls and returns matched tool messages", () => {
    const collector = collectToolRound();
    collector.openAI([
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: { name: providerToolName, arguments: '{"code":' },
      },
    ]);
    const reasoning = { type: "reasoning.encrypted", data: "opaque", index: 0 };
    collector.openAI(
      [{ index: 0, function: { arguments: `"${source}"}` } }],
      [reasoning],
    );
    const round = collector.finish("I will calculate this.")!;
    expect(round.calls[0]).toEqual({
      id: "call_1",
      name: providerToolName,
      arguments: JSON.stringify({ code: source }),
    });
    for (const id of ["openai", "openrouter", "lmstudio"] as const) {
      const config = defaultSettings.providers[id];
      expect(buildRequest(config, history).body).not.toHaveProperty("tools");
      const { body } = buildRequest(config, history, {
        allowCalls: true,
        exchanges: [{ round, results: [result] }],
      });
      expect(body).toMatchObject({
        tools: [{ type: "function", function: { name: providerToolName } }],
        tool_choice: "auto",
        messages: [
          { role: "user" },
          {
            role: "assistant",
            content: "I will calculate this.",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: providerToolName },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_1",
            content: JSON.stringify(result),
          },
        ],
      });
      if (id === "openrouter")
        expect(body).toHaveProperty("messages.1.reasoning_details", [
          reasoning,
        ]);
      else expect(body).not.toHaveProperty("messages.1.reasoning_details");
    }
  });

  it("preserves Gemini function call signatures and maps results to the native response schema", () => {
    const collector = collectToolRound();
    const call = {
      functionCall: {
        id: "function-id",
        name: providerToolName,
        args: { code: source },
      },
      thoughtSignature: "signed-by-provider",
    };
    collector.gemini([{ text: "Compute " }]);
    collector.gemini([{ text: "the value" }, call]);
    const round = collector.finish("Compute the value")!;
    expect(round.calls).toMatchObject([
      { id: "function-id", name: providerToolName },
    ]);
    const { body } = buildRequest(defaultSettings.providers.gemini, history, {
      allowCalls: false,
      exchanges: [{ round, results: [result] }],
    });
    expect(body).toMatchObject({
      tools: [{ functionDeclarations: [{ name: providerToolName }] }],
      toolConfig: { functionCallingConfig: { mode: "NONE" } },
      contents: [
        { role: "user" },
        { role: "model", parts: [{ text: "Compute the value" }, call] },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: "function-id",
                name: providerToolName,
                response: result,
              },
            },
          ],
        },
      ],
    });
  });

  it("rejects incomplete and oversized tool envelopes rather than executing partial code", () => {
    const incomplete = collectToolRound();
    incomplete.openAI([
      { index: 0, function: { name: providerToolName, arguments: "{" } },
    ]);
    expect(() => incomplete.finish("")).toThrow(/invalid or oversized/);
    const oversized = collectToolRound();
    expect(() =>
      oversized.openAI([
        {
          index: 0,
          id: "x",
          function: { name: providerToolName, arguments: "x".repeat(75_000) },
        },
      ]),
    ).toThrow(/oversized/);
  });

  it("bounds the model loop, returns structured failures, and never runs tools after cancellation", async () => {
    const collector = collectToolRound();
    collector.openAI([
      {
        index: 0,
        id: "call1",
        function: { name: providerToolName, arguments: '{"code":false}' },
      },
    ]);
    const round = collector.finish("")!;
    const settings: (ToolRequest | undefined)[] = [];
    const updates: string[] = [];
    await expect(
      runToolTurn(
        async (request) => {
          settings.push(
            request && { ...request, exchanges: [...request.exchanges] },
          );
          return round;
        },
        true,
        new AbortController().signal,
        ({ result }) => {
          if (result) updates.push(result.status);
        },
      ),
    ).rejects.toThrow(/reply limit/);
    expect(settings.map((entry) => entry?.allowCalls)).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      settings[2]?.exchanges.map(({ results }) => results[0]?.error?.code),
    ).toEqual(["input", "input"]);
    expect(updates).toEqual(["limit", "limit"]);
    const abort = new AbortController();
    await expect(
      runToolTurn(
        async () => {
          abort.abort();
          return round;
        },
        true,
        abort.signal,
        () => {
          throw new Error("must not execute");
        },
      ),
    ).rejects.toThrow(/aborted/);
  });

  it("validates persisted records, recovers interrupted runs, and excludes their code and results from later requests", () => {
    const record = {
      id: "test",
      name: javascriptToolName,
      code: source,
      startedAt: 2,
    } as const;
    const reply: Message = {
      id: "reply",
      role: "assistant",
      content: "Final answer",
      createdAt: 2,
      status: "streaming",
      toolExecutions: [record],
    };
    expect(recoverMessage(reply)).toMatchObject({
      status: "interrupted",
      toolExecutions: [{ result: { status: "cancelled" } }],
    });
    expect(validToolExecutions([{ ...record, result }])).toBe(true);
    expect(
      validToolExecutions([
        {
          ...record,
          result: {
            ...result,
            console: [{ level: "debug", text: "x".repeat(4097) }],
          },
        },
      ]),
    ).toBe(false);
    const completed: Message = {
      ...reply,
      status: "complete",
      toolExecutions: [{ ...record, result }],
    };
    expect(
      validBackup({
        version: 1,
        conversations: [
          {
            id: "chat",
            title: "Chat",
            draft: "",
            updatedAt: 1,
            messages: [completed],
          },
        ],
      }),
    ).toBe(true);
    const body = buildRequest(defaultSettings.providers.openai, [
      ...history,
      completed,
    ]).body;
    expect(JSON.stringify(body)).not.toMatch(/21 \* 2|testing|toolExecutions/);
  });
});
