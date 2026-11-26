import { clearSidebarPreferences } from "./sidebar-preferences";
import { storage } from "./storage";
import { rememberTheme } from "./theme";
import { defaultSettings, type Settings } from "./types";
import type { useConversationPersistence } from "./use-conversation-persistence";
import type { createWorkspaceSession } from "./workspace-session";

type ClearDependencies = {
  session: ReturnType<typeof createWorkspaceSession>;
  lifetime: AbortController;
  persistence: ReturnType<typeof useConversationPersistence>;
  settingsWrite: { current: Promise<void> };
  committedSettings: { current: Settings };
  resetVisibleState: () => void;
  resetLifetime: () => void;
  refreshStorage: () => void;
  notify: (text: string) => void;
  t: (text: string) => string;
};

/** Retire asynchronous work, settle queued writes, then publish only a committed clear. */
export function createClearDataAction({ session, lifetime, persistence, settingsWrite, committedSettings, resetVisibleState, resetLifetime, refreshStorage, notify, t }: ClearDependencies) {
  return async () => {
    const current = session.get();
    if (current.reply || current.processingFiles || current.navigating || lifetime.signal.aborted || !confirm([
      t("Permanently delete all local chats, attachments, memories, settings, and saved keys?"),
      t("Other open tabs keep their in-memory drafts and keys. Close them to end those sessions."),
    ].join("\n\n"))) return;
    lifetime.abort();
    session.update({ navigating: true });
    notify("Clearing local data…");
    try {
      try {
        persistence.flushDrafts();
        await Promise.all([...Object.values(persistence.writes.current), settingsWrite.current]);
        await storage.clear();
      } catch {
        notify("Could not clear local data. Nothing was deleted. Try again.");
        return;
      }
      committedSettings.current = defaultSettings;
      persistence.writes.current = Object.create(null);
      session.update({ threads: [], active: "", settings: defaultSettings, replySaves: new Map(), conflicts: new Set() });
      resetVisibleState();
      rememberTheme(defaultSettings.theme);
      clearSidebarPreferences();
      refreshStorage();
      notify("Local data cleared.");
    } finally {
      resetLifetime();
      session.update({ navigating: false });
    }
  };
}
