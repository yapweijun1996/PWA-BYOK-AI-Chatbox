import { afterEach, describe, expect, it, vi } from "vitest";
import { createReplyPublisher } from "../src/reply-publisher";
import { createWorkspaceSession } from "../src/workspace-session";
import { captureRequest, resolveConfig } from "../src/request-config";
import { defaultSettings, type Conversation, type Message } from "../src/types";

function setup() {
  const message: Message = { id: "reply", role: "assistant", content: "", createdAt: 1, status: "streaming" };
  const chat: Conversation = { id: "chat", title: "Chat", updatedAt: 1, draft: "", messages: [message] };
  const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings: defaultSettings });
  const controller = new AbortController();
  const request = captureRequest(resolveConfig(defaultSettings), 1, false);
  session.update({ reply: { phase: "streaming", conversationId: chat.id, controller, draft: null, request } });
  return { chat, controller, message, session };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("reply publisher", () => {
  it("throttles checkpoint persistence while continuing in-memory updates", () => {
    vi.useFakeTimers(); vi.stubGlobal("window", globalThis);
    const { chat, controller, message, session } = setup();
    const updateChat = vi.fn(async () => true);
    const publisher = createReplyPublisher({ chatId: chat.id, controller, session, updateChat, isCurrentReply: () => true, finishReply: () => {}, buildMessage: (status) => ({ ...message, status }) });
    publisher.checkpoint();
    vi.advanceTimersByTime(499); publisher.checkpoint();
    vi.advanceTimersByTime(1); publisher.checkpoint();
    expect(updateChat.mock.calls.map((call) => call[2])).toEqual([false, false, true]);
  });
  it("waits for the terminal save and blocks streaming updates while finalizing", async () => {
    const { chat, controller, message, session } = setup();
    let resolveSave!: (saved: boolean) => void;
    const updateChat = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve; }));
    const finishReply = vi.fn();
    const publisher = createReplyPublisher({ chatId: chat.id, controller, session, updateChat, isCurrentReply: () => true, finishReply, buildMessage: (status) => ({ ...message, content: "answer", status }) });
    const finishing = publisher.finish("complete");
    expect(session.get().reply?.phase).toBe("finalizing");
    expect(session.get().replySaves.get(chat.id)).toMatchObject({ status: "pending", message: { content: "answer", status: "complete" } });
    publisher.publish("streaming", true);
    expect(updateChat).toHaveBeenCalledTimes(1);
    expect(finishReply).not.toHaveBeenCalled();
    resolveSave(true); await finishing;
    expect(finishReply).toHaveBeenCalledOnce();
  });
  it("does not publish or finish an obsolete reply", async () => {
    const { chat, controller, message, session } = setup();
    const updateChat = vi.fn(async () => true);
    const finishReply = vi.fn();
    const publisher = createReplyPublisher({ chatId: chat.id, controller, session, updateChat, isCurrentReply: (candidate) => session.get().reply?.controller === candidate, finishReply, buildMessage: (status) => ({ ...message, status }) });
    session.update({ reply: null });
    publisher.checkpoint(); await publisher.finish("interrupted");
    expect(updateChat).not.toHaveBeenCalled();
    expect(finishReply).not.toHaveBeenCalled();
    expect(session.get().replySaves.size).toBe(0);
  });
  it("finishes even when a terminal save rejects", async () => {
    const { chat, controller, message, session } = setup();
    const updateChat = vi.fn(async () => { throw new Error("disk unavailable"); });
    const finishReply = vi.fn();
    const publisher = createReplyPublisher({ chatId: chat.id, controller, session, updateChat, isCurrentReply: () => true, finishReply, buildMessage: (status) => ({ ...message, status }) });
    await expect(publisher.finish("error")).rejects.toThrow("disk unavailable");
    expect(finishReply).toHaveBeenCalledOnce();
  });
});
