import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackupActions } from "../src/backup-actions";
import { storage } from "../src/storage";
import { createWorkspaceSession } from "../src/workspace-session";
import { defaultSettings, type Conversation } from "../src/types";
import type { useBackupState } from "../src/use-backup-state";
import type { useConversationPersistence } from "../src/use-conversation-persistence";

function setup() {
  const local: Conversation = { id: "chat", title: "Original", updatedAt: 1, draft: "draft", messages: [] };
  const incoming: Conversation = { ...local, title: "Imported", draft: "imported" };
  const session = createWorkspaceSession({ threads: [local], active: "chat", settings: defaultSettings });
  const backup = {
    exportPlan: null, setExportPlan: vi.fn(), importPreview: { version: 1, conversations: [incoming], existing: new Map([["chat", local]]), previousSettings: defaultSettings },
    setImportPreview: vi.fn(), importPreferences: false, setImportPreferences: vi.fn(), importing: { current: false }, fileSelection: { current: 0 }, importInput: { current: null }, resetBackup: vi.fn(),
  } as unknown as ReturnType<typeof useBackupState>;
  const persistence = { draftTimers: { current: new Map<string, number>() }, writes: { current: {} } } as ReturnType<typeof useConversationPersistence>;
  const notify = vi.fn();
  const actions = createBackupActions({ session, backup, persistence, signal: new AbortController().signal, settingsWrite: { current: Promise.resolve() }, committedSettings: { current: defaultSettings }, remember: vi.fn(), resetProviderForm: vi.fn(), notify });
  return { local, session, backup, persistence, notify, actions };
}
afterEach(() => vi.restoreAllMocks());

describe("backup import coordination", () => {
  it("does not overwrite a buffered draft", async () => {
    const { local, session, backup, persistence, actions } = setup();
    persistence.draftTimers.current.set("chat", 1);
    const commit = vi.spyOn(storage, "importBackup");
    await actions.finishImport(true);
    expect(commit).not.toHaveBeenCalled();
    expect(session.get().threads[0]).toBe(local);
    expect(session.get().navigating).toBe(false);
    expect(backup.importing.current).toBe(false);
  });
  it("retains visible data and preview if the atomic transaction fails", async () => {
    const { local, session, backup, notify, actions } = setup();
    vi.spyOn(storage, "importBackup").mockRejectedValue(new Error("failed"));
    await actions.finishImport(true);
    expect(session.get().threads[0]).toBe(local);
    expect(backup.setImportPreview).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith("Import failed. Nothing was imported; your existing data and saved keys are unchanged.");
    expect(session.get().navigating).toBe(false);
  });
  it("publishes imported data only after the transaction commits", async () => {
    const { local, session, backup, actions } = setup();
    const gate = Promise.withResolvers<void>();
    const commit = vi.spyOn(storage, "importBackup").mockReturnValue(gate.promise);
    const pending = actions.finishImport(true);
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(session.get().threads[0]).toBe(local);
    gate.resolve();
    await pending;
    expect(session.get().threads[0].title).toBe("Imported");
    expect(backup.setImportPreview).toHaveBeenCalledWith(null);
    expect(session.get().navigating).toBe(false);
  });
});
