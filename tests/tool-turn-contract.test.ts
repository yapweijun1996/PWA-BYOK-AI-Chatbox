import { describe, expect, it, vi } from "vitest";
import { createToolTurnRunner } from "../src/tool-turn";
import type { ToolRound } from "../src/provider-tools";
import type { ExecutionResult } from "../src/js-tool-runtime";

const success: ExecutionResult = { status: "success", durationMs: 0, console: [], truncated: false, value: { format: "json", text: "1" } };
const round = (...ids: string[]): ToolRound => ({ calls: ids.map((id) => ({ id, name: "calculate", arguments: "{}" })), text: "", geminiParts: [], reasoningDetails: [] });

describe("tool turn coordination", () => {
  it("preserves execution order, exchange history and budgets across rounds", async () => {
    const calls: Array<{ id: string; canExecute: boolean }> = [];
    const execute = vi.fn(async (call, context) => { calls.push({ id: call.id, canExecute: context.canExecute }); return success; });
    const states: Array<{ allowCalls: boolean; exchangeCount: number }> = [];
    const exchanges: string[][] = [];
    await createToolTurnRunner(execute)(async (tool) => {
      states.push({ allowCalls: tool!.allowCalls, exchangeCount: tool!.exchanges.length });
      return states.length === 1 ? round("1", "2", "3") : states.length === 2 ? round("4", "5") : undefined;
    }, true, new AbortController().signal, () => {}, [], (exchange) => { exchanges.push(exchange.round.calls.map((call) => call.id)); });
    expect(calls).toEqual(["1", "2", "3", "4", "5"].map((id, index) => ({ id, canExecute: index < 4 })));
    expect(states).toEqual([{ allowCalls: true, exchangeCount: 0 }, { allowCalls: true, exchangeCount: 1 }, { allowCalls: false, exchangeCount: 2 }]);
    expect(exchanges).toEqual([["1", "2", "3"], ["4", "5"]]);
  });
  it("stops before the next tool and does not publish a partial exchange after abort", async () => {
    const abort = new AbortController();
    const onExchange = vi.fn();
    const execute = vi.fn(async () => { abort.abort(); return success; });
    await expect(createToolTurnRunner(execute)(async () => round("1", "2"), true, abort.signal, () => {}, [], onExchange)).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(onExchange).not.toHaveBeenCalled();
  });
  it("does not run tools if the final round requests more", async () => {
    const execute = vi.fn(async () => success);
    await expect(createToolTurnRunner(execute)(async () => round("1"), true, new AbortController().signal, () => {})).rejects.toThrow(/reply limit/);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
