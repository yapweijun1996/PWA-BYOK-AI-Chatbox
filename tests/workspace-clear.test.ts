import { afterEach, describe, expect, it, vi } from "vitest";
import { createClearDataAction } from "../src/workspace-clear";
import { createWorkspaceSession } from "../src/workspace-session";
import { storage } from "../src/storage";
import { defaultSettings, type Conversation } from "../src/types";
import type { useConversationPersistence } from "../src/use-conversation-persistence";

vi.mock("../src/theme", () => ({ rememberTheme: vi.fn() }));
vi.mock("../src/sidebar-preferences", () => ({ clearSidebarPreferences: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  const chat: Conversation = { id: "chat", title: "Chat", draft: "draft", updatedAt: 1, messages: [] };
  const session = createWorkspaceSession({ active: chat.id, threads: [chat], settings: defaultSettings });
  const lifetime = new AbortController(), notify = vi.fn(), resetVisibleState = vi.fn(), resetLifetime = vi.fn();
  const persistence = { flushDrafts: vi.fn(), writes: { current: {} as Record<string, Promise<boolean>> } } as unknown as ReturnType<typeof useConversationPersistence>;
  const action = createClearDataAction({ session, lifetime, persistence, settingsWrite: { current: Promise.resolve() }, committedSettings: { current: defaultSettings }, resetVisibleState, resetLifetime, refreshStorage: vi.fn(), notify, t: (text) => text });
  return { chat, session, lifetime, notify, resetVisibleState, resetLifetime, persistence, action };
}

describe("workspace data clear", () => {
  it("leaves data and in-flight work untouched when cancelled", async () => {
    vi.stubGlobal("confirm", () => false);
    const { chat, session, lifetime, action } = setup();
    const clear = vi.spyOn(storage, "clear");
    await action();
    expect(lifetime.signal.aborted).toBe(false);
    expect(session.get().threads[0]).toBe(chat);
    expect(clear).not.toHaveBeenCalled();
  });
  it("retires async work and waits for pending writes before clearing", async () => {
    vi.stubGlobal("confirm", () => true);
    const { chat, session, lifetime, action, persistence, resetVisibleState, resetLifetime } = setup();
    const pendingWrite = Promise.withResolvers<boolean>();
    persistence.writes.current.chat = pendingWrite.promise;
    const clear = vi.spyOn(storage, "clear").mockResolvedValue();
    const pending = action();
    expect(lifetime.signal.aborted).toBe(true);
    expect(session.get().threads[0]).toBe(chat);
    expect(clear).not.toHaveBeenCalled();
    pendingWrite.resolve(true);
    await pending;
    expect(clear).toHaveBeenCalledOnce();
    expect(session.get().threads).toEqual([]);
    expect(session.get().navigating).toBe(false);
    expect(resetVisibleState).toHaveBeenCalledOnce();
    expect(resetLifetime).toHaveBeenCalledOnce();
  });
  it("keeps visible data when the storage clear fails", async () => {
    vi.stubGlobal("confirm", () => true);
    const { chat, session, notify, action, resetVisibleState, resetLifetime } = setup();
    vi.spyOn(storage, "clear").mockRejectedValue(new Error("transaction aborted"));
    await action();
    expect(session.get().threads[0]).toBe(chat);
    expect(session.get().navigating).toBe(false);
    expect(resetVisibleState).not.toHaveBeenCalled();
    expect(resetLifetime).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenLastCalledWith("Could not clear local data. Nothing was deleted. Try again.");
  });
});
