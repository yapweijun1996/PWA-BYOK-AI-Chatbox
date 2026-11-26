import { afterEach, describe, expect, it, vi } from "vitest";
import { activePath, asBranchConversation } from "../src/branches";
import { createConversationActions } from "../src/workspace-conversations";
import { createWorkspaceSession } from "../src/workspace-session";
import { storage } from "../src/storage";
import { defaultSettings, type Conversation, type Message } from "../src/types";
import type { useConversationPersistence } from "../src/use-conversation-persistence";

const message = (id: string, role: Message["role"]): Message => ({ id, role, content: id, status: "complete", createdAt: 1 });
const branchChat = (): Conversation => asBranchConversation({ id: "chat", title: "Chat", draft: "unsaved draft", updatedAt: 1, messages: [message("question", "user"), message("first", "assistant"), message("second", "assistant")] });
function setup(chat = branchChat()) {
  const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings: defaultSettings });
  const persistence = {
    draftTimers: { current: new Map<string, number>() }, writes: { current: {} },
    queueSave: vi.fn(async () => true), updateChat: vi.fn(async () => true),
    flushDraft: vi.fn((_id: string): Promise<boolean> | undefined => undefined), flushDrafts: vi.fn(),
  } as unknown as ReturnType<typeof useConversationPersistence>;
  const setSearchMatch = vi.fn();
  const queuePreferenceWrite = vi.fn(async (save: () => Promise<void>) => { await save(); return true; });
  const actions = createConversationActions({ session, persistence, queuePreferenceWrite, settingsWrite: { current: Promise.resolve() }, followReply: { current: true }, setView: vi.fn(), mobileDrawer: false, closeDrawer: vi.fn(), searchSequence: { current: 0 }, setSearchMatch, setNotice: vi.fn(), report: vi.fn(), t: (text) => text });
  return { actions, session, persistence, setSearchMatch, queuePreferenceWrite };
}
afterEach(() => vi.restoreAllMocks());

describe("conversation actions", () => {
  it("does not navigate or lose the draft when a pending save fails", async () => {
    const { actions, session, persistence, queuePreferenceWrite } = setup();
    vi.mocked(persistence.flushDraft).mockReturnValue(Promise.resolve(false));
    vi.mocked(persistence.queueSave).mockResolvedValue(false);
    expect(await actions.navigateChat()).toBeUndefined();
    expect(session.get().active).toBe("chat");
    expect(session.get().threads[0].draft).toBe("unsaved draft");
    expect(session.get().navigating).toBe(false);
    expect(queuePreferenceWrite).not.toHaveBeenCalled();
  });
  it("only switches to a hidden branch after its selection is saved", async () => {
    const { actions, session, setSearchMatch } = setup();
    const saved = vi.spyOn(storage, "openSearchResult").mockResolvedValue();
    expect(activePath(session.get().threads[0]).map((item) => item.id)).toEqual(["question", "second"]);
    expect(await actions.openSearchResult("chat", "first")).toBeUndefined();
    expect(saved).toHaveBeenCalledOnce();
    expect(activePath(session.get().threads[0]).map((item) => item.id)).toEqual(["question", "first"]);
    expect(setSearchMatch).toHaveBeenCalledWith({ chatId: "chat", messageId: "first", sequence: 1 });
    expect(session.get().navigating).toBe(false);
  });
  it("keeps the current branch when persisting the search selection fails", async () => {
    const { actions, session, setSearchMatch, queuePreferenceWrite } = setup();
    queuePreferenceWrite.mockResolvedValue(false);
    expect(await actions.openSearchResult("chat", "first")).toMatch(/unchanged/);
    expect(activePath(session.get().threads[0]).map((item) => item.id)).toEqual(["question", "second"]);
    expect(setSearchMatch).not.toHaveBeenCalled();
    expect(session.get().navigating).toBe(false);
  });
});
