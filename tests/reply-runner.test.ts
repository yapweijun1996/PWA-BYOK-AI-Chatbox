import { afterEach, describe, expect, it, vi } from "vitest";
import { createReplyRunner, type ProviderObservation } from "../src/reply-runner";
import { responseIdentity } from "../src/response-telemetry";
import { captureRequest, resolveConfig } from "../src/request-config";
import { createWorkspaceSession } from "../src/workspace-session";
import { defaultSettings, type Conversation, type Message } from "../src/types";
import { streamChat } from "../src/providers";

vi.mock("../src/providers", () => ({ streamChat: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("reply runner", () => {
  it("publishes the final reply and clears the active run", async () => {
    vi.stubGlobal("window", globalThis);
    const config = resolveConfig(defaultSettings);
    const request = captureRequest(config, 10, false);
    const message: Message = { id: "reply", role: "assistant", content: "", createdAt: 10, status: "streaming" };
    const chat: Conversation = { id: "chat", title: "Chat", updatedAt: 10, draft: "", messages: [message] };
    const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings: defaultSettings });
    const controller = new AbortController();
    session.update({ reply: { phase: "saving", conversationId: chat.id, controller, draft: null, request } });
    const observations: Array<ProviderObservation | undefined> = [];
    vi.mocked(streamChat).mockImplementation(async (_config, _secret, _history, _signal, onText) => { onText("Hello"); return undefined; });
    const runner = createReplyRunner({
      session, setNotice: () => {}, isCurrentReply: (current) => session.get().reply?.controller === current,
      updateChat: async (id, update) => { session.update({ threads: session.get().threads.map((item) => item.id === id ? update(item) : item) }); return true; },
      providerObservationSequence: { current: 0 }, setProviderObservation: (value) => observations.push(value),
      finishReply: () => session.update({ reply: null }),
    });
    await runner(chat.id, [], { message, request, telemetry: responseIdentity(config.config), target: config.config, secret: "", credentialRevision: 0 }, controller);
    expect(session.get().threads[0].messages[0]).toMatchObject({ content: "Hello", status: "complete" });
    expect(session.get().reply).toBeNull();
    expect(observations.map((value) => value?.state)).toEqual(["connecting", "succeeded"]);
  });
  it("saves a stopped reply as interrupted and ignores late provider output", async () => {
    vi.stubGlobal("window", globalThis);
    const config = resolveConfig(defaultSettings);
    const request = captureRequest(config, 10, false);
    const message: Message = { id: "reply", role: "assistant", content: "", createdAt: 10, status: "streaming" };
    const chat: Conversation = { id: "chat", title: "Chat", updatedAt: 10, draft: "", messages: [message] };
    const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings: defaultSettings });
    const controller = new AbortController();
    session.update({ reply: { phase: "saving", conversationId: chat.id, controller, draft: null, request } });
    const observations: Array<ProviderObservation | undefined> = [];
    const finalSave = Promise.withResolvers<boolean>();
    const finishReply = vi.fn(() => session.update({ reply: null }));
    vi.mocked(streamChat).mockImplementation(async (_config, _secret, _history, _signal, onText, onReasoning) => {
      onText("Partial"); onReasoning("Thinking");
      controller.abort();
      onText(" late"); onReasoning(" late");
      throw new DOMException("Stopped", "AbortError");
    });
    const runner = createReplyRunner({
      session, setNotice: () => {}, isCurrentReply: (current) => session.get().reply?.controller === current,
      updateChat: async (id, update) => {
        session.update({ threads: session.get().threads.map((item) => item.id === id ? update(item) : item) });
        return session.get().threads[0].messages[0].status === "interrupted" ? finalSave.promise : true;
      },
      providerObservationSequence: { current: 0 }, setProviderObservation: (value) => observations.push(value), finishReply,
    });
    const running = runner(chat.id, [], { message, request, telemetry: responseIdentity(config.config), target: config.config, secret: "", credentialRevision: 0 }, controller);
    await vi.waitFor(() => expect(session.get().reply?.phase).toBe("finalizing"));
    expect(session.get().threads[0].messages[0]).toMatchObject({ content: "Partial", reasoning: "Thinking", status: "interrupted" });
    expect(session.get().replySaves.get(chat.id)?.status).toBe("pending");
    expect(finishReply).not.toHaveBeenCalled();
    expect(observations.map((value) => value?.state)).toEqual(["connecting", undefined]);
    finalSave.resolve(true); await running;
    expect(finishReply).toHaveBeenCalledOnce();
  });
});
