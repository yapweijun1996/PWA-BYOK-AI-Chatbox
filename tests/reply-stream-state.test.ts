import { describe, expect, it, vi } from "vitest";
import { createReplyStreamState } from "../src/reply-stream-state";
import { observeProviderRound } from "../src/provider-observation";
import { responseIdentity } from "../src/response-telemetry";
import { defaultSettings, type Message } from "../src/types";

const target = defaultSettings.providers.openai;
const message: Message = { id: "reply", role: "assistant", content: "", createdAt: 1, status: "streaming" };

describe("reply stream state", () => {
  it("joins text and reasoning across rounds and ignores inactive updates", () => {
    let active = true;
    const checkpoint = vi.fn();
    const state = createReplyStreamState(message, target, responseIdentity(target), undefined, () => active, checkpoint);
    const first = state.beginRound();
    first.onText("one"); first.onText("!"); first.onReasoning("think"); first.complete();
    const second = state.beginRound();
    second.onText("two"); second.onReasoning("more");
    active = false; second.onText("ignored"); second.onReasoning("ignored"); second.complete();
    expect(state.message("complete")).toMatchObject({ content: "one!\n\ntwo", reasoning: "think\n\nmore", status: "complete" });
    expect(checkpoint).toHaveBeenCalledTimes(5);
  });
  it("keeps error details on error messages only", () => {
    const state = createReplyStreamState(message, target, responseIdentity(target), undefined, () => true, () => {});
    state.fail(new Error("network"));
    expect(state.message("error")).toMatchObject({ error: "network" });
    expect(state.message("interrupted")).not.toHaveProperty("error");
  });
});

describe("provider observations", () => {
  it("does not allow an older request to overwrite a newer observation", async () => {
    const sequence = { current: 0 };
    const set = vi.fn();
    let resolveOld!: () => void;
    const old = observeProviderRound(target, 1, new AbortController().signal, sequence, set, () => new Promise<void>((resolve) => { resolveOld = resolve; }));
    await observeProviderRound(target, 2, new AbortController().signal, sequence, set, async () => {});
    resolveOld(); await old;
    expect(set.mock.calls.map(([value]) => value)).toEqual([
      expect.objectContaining({ state: "connecting", credentialRevision: 1 }),
      expect.objectContaining({ state: "connecting", credentialRevision: 2 }),
      expect.objectContaining({ state: "succeeded", credentialRevision: 2 }),
    ]);
  });
  it("clears the current observation on abort and reports other failures", async () => {
    const sequence = { current: 0 }, set = vi.fn(), abort = new AbortController();
    await expect(observeProviderRound(target, 1, abort.signal, sequence, set, async () => { abort.abort(); throw new Error("cancelled"); })).rejects.toThrow("cancelled");
    expect(set).toHaveBeenLastCalledWith(undefined);
    await expect(observeProviderRound(target, 1, new AbortController().signal, sequence, set, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ state: "failed" }));
  });
});
