import { describe, expect, it, vi } from "vitest";
import { activePath, asBranchConversation } from "../src/branches";
import { createMessageActions } from "../src/workspace-message-actions";
import { createWorkspaceSession } from "../src/workspace-session";
import { captureRequest, resolveConfig } from "../src/request-config";
import { responseIdentity } from "../src/response-telemetry";
import { defaultSettings, type Conversation, type Message } from "../src/types";

const message = (id: string, role: Message["role"]): Message => ({ id, role, content: id, status: "complete", createdAt: 1 });
function setup() {
  const chat = asBranchConversation({ id: "chat", title: "Chat", draft: "new draft", updatedAt: 1, messages: [message("question", "user"), message("first", "assistant"), message("second", "assistant")] });
  const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings: defaultSettings });
  const effective = resolveConfig(defaultSettings);
  const request = captureRequest(effective, 10, false);
  const runReply = vi.fn(async () => {}), finishReply = vi.fn(), setNotice = vi.fn();
  const queueSave = vi.fn(async (_chat: Conversation) => true);
  const updateChat = vi.fn(async (id: string, update: (chat: Conversation) => Conversation) => {
    session.update({ threads: session.get().threads.map((item) => item.id === id ? update(item) : item) }); return true;
  });
  const deps: Parameters<typeof createMessageActions>[0] = {
    session, chat, settings: defaultSettings, files: [], effective, draftHistory: activePath(chat), isConfigured: true, sendBlocked: undefined,
    blockedFor: () => undefined, configured: () => true, canStartReply: () => true, askToShareHistory: async () => true,
    followReply: { current: true }, prepareReply: () => ({ message: { id: "new-reply", role: "assistant", content: "", createdAt: 10, status: "streaming" }, request, telemetry: responseIdentity(effective.config), target: effective.config, secret: "", credentialRevision: 0 }),
    beginReply: () => new AbortController(), updateChat, queueSave, finishReply, runReply, setNotice, openProvider: vi.fn(),
  };
  return { chat, session, deps, queueSave, updateChat, runReply, finishReply, setNotice };
}

describe("workspace message actions", () => {
  it("does not send a provider request when the initial local save fails", async () => {
    const { deps, session, updateChat, runReply, finishReply, setNotice } = setup();
    updateChat.mockImplementationOnce(async (id, update) => {
      session.update({ threads: session.get().threads.map((item) => item.id === id ? update(item) : item) });
      return false;
    });
    await createMessageActions(deps).send();
    expect(runReply).not.toHaveBeenCalled();
    expect(finishReply).toHaveBeenCalledOnce();
    expect(session.get().threads[0].draft).toBe("new draft");
    expect(setNotice).toHaveBeenCalledWith("Message was not sent because local storage failed. Your draft and attachments are still visible.");
  });
  it("does not switch branches before the selection is durable", async () => {
    const { deps, session, queueSave } = setup();
    const gate = Promise.withResolvers<boolean>();
    queueSave.mockReturnValueOnce(gate.promise);
    const pending = createMessageActions(deps).changeBranch("first");
    expect(activePath(session.get().threads[0]).map((item) => item.id)).toEqual(["question", "second"]);
    expect(session.get().navigating).toBe(true);
    gate.resolve(true);
    await pending;
    expect(activePath(session.get().threads[0]).map((item) => item.id)).toEqual(["question", "first"]);
    expect(session.get().navigating).toBe(false);
  });
  it("keeps the selected branch when saving the new selection fails", async () => {
    const { deps, session, queueSave } = setup();
    queueSave.mockResolvedValueOnce(false);
    await createMessageActions(deps).changeBranch("first");
    expect(activePath(session.get().threads[0]).map((item) => item.id)).toEqual(["question", "second"]);
    expect(session.get().navigating).toBe(false);
  });
});
