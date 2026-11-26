import { describe, expect, it } from "vitest";
import { prepareBackupImport } from "../src/backup-import-plan";
import { ImportConflictError } from "../src/storage";
import { defaultSettings, type Conversation, type Settings } from "../src/types";
import type { BackupPreview } from "../src/use-backup-state";
import { createWorkspaceSession } from "../src/workspace-session";

const chat = (id: string, overrides: Partial<Conversation> = {}): Conversation => ({ id, title: id, updatedAt: 1, draft: "", messages: [], ...overrides });
function setup() {
  const local = chat("existing", { draft: "local draft", cloudHistoryRecipient: "openai", cloudHistoryKnownIds: ["local-id"] });
  const settings: Settings = { ...defaultSettings, vaults: { openai: { version: 1, salt: "salt", iv: "iv", data: "local-key", iterations: 600000 } } };
  const session = createWorkspaceSession({ threads: [local, chat("other")], active: local.id, settings });
  const incoming = chat("existing", { archived: true, cloudHistoryRecipient: "openai", cloudHistoryKnownIds: ["imported-id"], messages: [{ id: "reply", role: "assistant", content: "partial", status: "streaming", createdAt: 1 }] });
  const preview: BackupPreview = { version: 1, conversations: [incoming], settings: { theme: "dark" }, existing: new Map([[local.id, local]]), previousSettings: settings };
  return { local, incoming, settings, session, preview };
}

describe("backup import planning", () => {
  it("preserves device vaults, strips consent and recovers interrupted messages", () => {
    const { local, incoming, settings, session, preview } = setup();
    const plan = prepareBackupImport(preview, [incoming], session.get(), true);
    expect(plan.records[0].previous).toBe(local);
    expect(plan.records[0].next.cloudHistoryRecipient).toBeUndefined();
    expect(plan.records[0].next.cloudHistoryKnownIds).toBeUndefined();
    expect(plan.records[0].next.messages[0].status).toBe("interrupted");
    expect(plan.nextSettings.vaults).toBe(settings.vaults);
    expect(plan.nextSettings.theme).toBe("dark");
    expect(plan.nextActive).toBe("other");
    expect(session.get().threads[0]).toBe(local);
  });
  it("rejects conversations changed after the preview", () => {
    const { incoming, session, preview } = setup();
    session.update({ threads: session.get().threads.map((item) => item.id === incoming.id ? { ...item, draft: "new edit" } : item) });
    expect(() => prepareBackupImport(preview, [incoming], session.get(), true)).toThrow(ImportConflictError);
  });
  it("rejects preference changes made after the preview", () => {
    const { incoming, session, preview } = setup();
    session.update({ settings: { ...session.get().settings, theme: "light" } });
    expect(() => prepareBackupImport(preview, [incoming], session.get(), true)).toThrow(ImportConflictError);
  });
  it("does not replace current settings when preferences are not selected", () => {
    const { incoming, settings, session, preview } = setup();
    const plan = prepareBackupImport(preview, [incoming], session.get(), false);
    expect(plan.changeSettings).toBe(false);
    expect(plan.nextSettings).toBe(settings);
  });
});
