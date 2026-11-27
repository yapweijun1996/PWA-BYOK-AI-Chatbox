import { afterEach, describe, expect, it, vi } from "vitest";
import { useConversationPersistence } from "../src/use-conversation-persistence";
import { createWorkspaceSession } from "../src/workspace-session";
import { ConversationConflictError, storage } from "../src/storage";
import { defaultSettings, type Conversation, type Message } from "../src/types";

// Exercise the real persistence hook's queue without mounting a UI.
vi.mock("react", () => ({ useRef: (value: unknown) => ({ current: value }), useCallback: (callback: unknown) => callback }));
afterEach(() => vi.restoreAllMocks());

function setup() {
  const message: Message = { id: "reply", role: "assistant", content: "partial", createdAt: 1, status: "streaming" };
  const chat: Conversation = { id: "chat", title: "Chat", updatedAt: 1, draft: "", messages: [message] };
  const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings: defaultSettings });
  const report = vi.fn();
  const persistence = useConversationPersistence(session, report);
  return { chat, message, session, report, ...persistence };
}

describe("conversation persistence races", () => {
  it("does not let an older checkpoint acknowledge the queued terminal reply", async () => {
    const { chat, message, session, queueSave } = setup();
    const checkpoint = Promise.withResolvers<void>(), final = Promise.withResolvers<void>();
    const save = vi.spyOn(storage, "saveConversation").mockImplementationOnce(() => checkpoint.promise).mockImplementationOnce(() => final.promise);
    const first = queueSave(chat);
    const terminal: Message = { ...message, status: "complete", content: "complete answer" };
    session.setReplySave(chat.id, { message: terminal, status: "pending" });
    const second = queueSave({ ...chat, messages: [terminal] });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    checkpoint.resolve(); expect(await first).toBe(true);
    expect(session.get().replySaves.get(chat.id)).toEqual({ message: terminal, status: "pending" });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    final.resolve(); expect(await second).toBe(true);
    expect(session.get().replySaves.has(chat.id)).toBe(false);
  });
  it("retains the failed terminal reply for a successful retry without regenerating it", async () => {
    const { chat, message, session, report, queueSave } = setup();
    const terminal: Message = { ...message, status: "complete", content: "answer" };
    const finalChat = { ...chat, messages: [terminal] };
    session.setReplySave(chat.id, { message: terminal, status: "pending" });
    const save = vi.spyOn(storage, "saveConversation").mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(undefined);
    expect(await queueSave(finalChat)).toBe(false);
    expect(session.get().replySaves.get(chat.id)).toEqual({ message: terminal, status: "failed" });
    expect(report).toHaveBeenCalledOnce();
    expect(await queueSave(finalChat)).toBe(true);
    expect(session.get().replySaves.has(chat.id)).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("does not mark a newer queued terminal save failed when an earlier save fails", async () => {
    const { chat, message, session, report, queueSave } = setup();
    const firstWrite = Promise.withResolvers<void>(), retry = Promise.withResolvers<void>();
    const save = vi.spyOn(storage, "saveConversation").mockImplementationOnce(() => firstWrite.promise).mockImplementationOnce(() => retry.promise);
    const terminal: Message = { ...message, status: "complete", content: "answer" };
    const finalChat = { ...chat, messages: [terminal] };
    session.setReplySave(chat.id, { message: terminal, status: "pending" });
    const first = queueSave(finalChat);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const second = queueSave(finalChat);
    firstWrite.reject(new Error("temporary storage failure"));
    expect(await first).toBe(false);
    expect(session.get().replySaves.get(chat.id)).toEqual({ message: terminal, status: "pending" });
    expect(report).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    retry.resolve(); expect(await second).toBe(true);
    expect(session.get().replySaves.has(chat.id)).toBe(false);
  });
  it("blocks a queued write when a cross-window conflict appears before it starts", async () => {
    const { chat, message, session, report, queueSave } = setup();
    const checkpoint = Promise.withResolvers<void>();
    const save = vi.spyOn(storage, "saveConversation").mockImplementationOnce(() => checkpoint.promise);
    const first = queueSave(chat);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const terminal: Message = { ...message, status: "interrupted" };
    session.setReplySave(chat.id, { message: terminal, status: "pending" });
    const second = queueSave({ ...chat, messages: [terminal] });
    session.update({ conflicts: new Set([chat.id]) });
    checkpoint.resolve(); expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(session.get().replySaves.get(chat.id)).toEqual({ message: terminal, status: "failed" });
    expect(report).toHaveBeenCalledWith(expect.any(ConversationConflictError));
  });
});
