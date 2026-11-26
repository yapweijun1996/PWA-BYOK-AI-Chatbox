import { downloadBackup, planBackupExport, readBackupFile } from "./backup";
import { prepareBackupImport } from "./backup-import-plan";
import { checkedLmStudioAddress, credentialDestination, type SessionCredential } from "./credential-destination";
import { mergeSettings } from "./data-contracts";
import { ImportConflictError, storage } from "./storage";
import { rememberTheme } from "./theme";
import type { ProviderId, Settings } from "./types";
import type { useBackupState, BackupPreview } from "./use-backup-state";
import type { useConversationPersistence } from "./use-conversation-persistence";
import type { createWorkspaceSession } from "./workspace-session";

type Dependencies = {
  session: ReturnType<typeof createWorkspaceSession>;
  backup: ReturnType<typeof useBackupState>;
  persistence: ReturnType<typeof useConversationPersistence>;
  signal: AbortSignal;
  settingsWrite: { current: Promise<void> };
  committedSettings: { current: Settings };
  remember: (provider: ProviderId, credential?: SessionCredential) => void;
  resetProviderForm: () => void;
  notify: (message: string) => void;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
export function backupImportDestination(settings: Settings, preview: BackupPreview | null, t: (text: string) => string) {
  if (!preview?.settings) return undefined;
  const next = mergeSettings({ ...settings, ...preview.settings }, settings.providers.lmstudio.endpoint).providers.lmstudio;
  const destination = credentialDestination(next);
  return destination !== credentialDestination(settings.providers.lmstudio) ? (destination ?? t("Invalid server address")) : undefined;
}
export function createBackupActions({ session, backup, persistence, signal: workspaceSignal, settingsWrite, committedSettings, remember, resetProviderForm, notify: setNotice }: Dependencies) {
  const { setExportPlan, importPreview, setImportPreview, importPreferences, setImportPreferences, importing, fileSelection, importInput } = backup;
  const { draftTimers, writes } = persistence;
  const exportData = () => {
    setExportPlan(null);
    try {
      const current = session.get();
      const plan = planBackupExport(current.threads, current.settings);
      if (plan.groups.length === 1 && !plan.tooLarge.length)
        downloadBackup(plan.groups[0].blob, "luma-chat-backup.json");
      else setExportPlan(plan);
      if (plan.omittedServerAddress)
        setNotice(
          "Backup excludes an invalid LM Studio server address. Set a valid address in AI providers.",
        );
    } catch (error) {
      setNotice(errorText(error));
    }
  };
  const importFile = async (file?: File) => {
    if (!file || importing.current || workspaceSignal.aborted) return;
    const selection = ++fileSelection.current;
    setImportPreview(null);
    setImportPreferences(false);
    if (importInput.current) importInput.current.value = "";
    try {
      const value = await readBackupFile(file, undefined, workspaceSignal);
      if (workspaceSignal.aborted || selection !== fileSelection.current)
        return;
      const address = value.settings?.providers?.lmstudio?.endpoint;
      if (address !== undefined && !checkedLmStudioAddress(address))
        setNotice(
          "Invalid LM Studio address in backup. Import will keep the current server address.",
        );
      const ids = new Set(value.conversations.map(({ id }) => id));
      const current = session.get();
      const existing = new Map(
        current.threads.filter((c) => ids.has(c.id)).map((c) => [c.id, c]),
      );
      setImportPreview({
        ...value,
        existing,
        previousSettings: current.settings,
      });
    } catch (e) {
      if (!workspaceSignal.aborted && selection === fileSelection.current)
        setNotice(errorText(e));
    }
  };
  const finishImport = async (overwrite: boolean) => {
    const current = session.get();
    if (
      !importPreview ||
      workspaceSignal.aborted ||
      current.reply ||
      current.processingFiles ||
      current.navigating
    )
      return;
    const preview = importPreview;
    setNotice("Importing backup…");
    importing.current = true;
    session.update({ navigating: true });
    try {
      const selected = preview.conversations.filter(
        (chat) => overwrite || !preview.existing.has(chat.id),
      );
      // Do not manufacture writes to flush an import. A buffered/failed draft
      // is still the user's work, not a durable record we can safely replace.
      if (selected.some(({ id }) => draftTimers.current.has(id))) {
        setNotice(
          "A local edit is still saving. Try the import again after it is saved.",
        );
        return;
      }
      await Promise.all([
        settingsWrite.current,
        ...selected.map(({ id }) => writes.current[id]),
      ]);
      const latest = session.get();
      if (selected.some(({ id }) => latest.replySaves.has(id))) {
        setNotice(
          "Save the local reply before replacing its conversation, or skip conflicts.",
        );
        return;
      }
      const { records, previous, changeSettings, nextSettings, nextThreads, nextActive } = prepareBackupImport(preview, selected, latest, importPreferences);
      await storage.importBackup({
        records,
        settings: changeSettings ? { previous, next: nextSettings } : undefined,
        active:
          nextActive !== latest.active
            ? { previous: latest.active, next: nextActive }
            : undefined,
      });
      if (
        credentialDestination(previous.providers.lmstudio) !==
        credentialDestination(nextSettings.providers.lmstudio)
      ) {
        remember("lmstudio");
        resetProviderForm();
      }
      session.update({
        threads: nextThreads,
        active: nextActive,
        settings: nextSettings,
      });
      committedSettings.current = nextSettings;
      if (changeSettings) rememberTheme(nextSettings.theme);
      setImportPreview(null);
      setExportPlan(null);
      setNotice(`Imported ${records.length} conversations.`);
    } catch (error) {
      setNotice(
        error instanceof ImportConflictError
          ? "Local data changed since preview. Nothing was imported. Save your work, reload and preview again."
          : "Import failed. Nothing was imported; your existing data and saved keys are unchanged.",
      );
    } finally {
      importing.current = false;
      session.update({ navigating: false });
    }
  };
  return { exportData, importFile, finishImport };
}
