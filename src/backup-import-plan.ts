import { mergeSettings, recoverMessage } from "./data-contracts";
import { portableConversation } from "./history-sharing";
import { ImportConflictError } from "./storage";
import { mergeProjects, mostRecentVisible } from "./workspace";
import type { BackupPreview } from "./use-backup-state";
import type { createWorkspaceSession } from "./workspace-session";
import type { Conversation } from "./types";

/** Construct the complete transaction without mutating the live workspace. */
export function prepareBackupImport(preview: BackupPreview, selected: Conversation[], latest: ReturnType<ReturnType<typeof createWorkspaceSession>["get"]>, importPreferences: boolean) {
  const byId = new Map(latest.threads.map((chat) => [chat.id, chat]));
  const records = selected.map((chat) => {
    const previous = preview.existing.get(chat.id);
    if (byId.get(chat.id) !== previous || latest.conflicts.has(chat.id)) throw new ImportConflictError();
    return { previous, next: { ...portableConversation(chat), messages: chat.messages.map(recoverMessage) } };
  });
  const previous = latest.settings;
  const projects = mergeProjects(previous.projects, preview.projects ?? []);
  const applyPreferences = importPreferences && preview.settings !== undefined;
  const changeSettings = applyPreferences || projects.length !== previous.projects.length;
  if (changeSettings && preview.previousSettings !== previous) throw new ImportConflictError();
  const nextSettings = applyPreferences
    ? mergeSettings({ ...previous, ...preview.settings, projects, vaults: previous.vaults }, previous.providers.lmstudio.endpoint)
    : changeSettings ? { ...previous, projects } : previous;
  const ids = new Set(records.map(({ next }) => next.id));
  const nextThreads = [...records.map(({ next }) => next), ...latest.threads.filter((chat) => !ids.has(chat.id))];
  const nextActive = !latest.active || records.some(({ next }) => next.id === latest.active && next.archived)
    ? mostRecentVisible(nextThreads) : latest.active;
  return { records, previous, changeSettings, nextSettings, nextThreads, nextActive };
}
