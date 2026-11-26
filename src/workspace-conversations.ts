import { activePath, selectBranch } from "./branches";
import { recoverMessage } from "./data-contracts";
import { portableConversation } from "./history-sharing";
import { storage } from "./storage";
import { id, type Conversation } from "./types";
import { mostRecentVisible } from "./workspace";
import { selectActiveChat, type createWorkspaceSession } from "./workspace-session";
import type { RequestOverrides } from "./request-config";
import type { useConversationPersistence } from "./use-conversation-persistence";
import type { ChatOrganization } from "./workspace";
import type { WorkspaceView } from "./settings-sections";

type ConversationDependencies = {
  session: ReturnType<typeof createWorkspaceSession>;
  persistence: ReturnType<typeof useConversationPersistence>;
  queuePreferenceWrite: (save: () => Promise<void>) => Promise<boolean>;
  settingsWrite: { current: Promise<void> };
  followReply: { current: boolean };
  setView: (view: WorkspaceView) => void;
  mobileDrawer: boolean;
  closeDrawer: () => void;
  searchSequence: { current: number };
  setSearchMatch: (value: { chatId: string; messageId: string; sequence: number }) => void;
  setNotice: (text: string) => void;
  report: (error: unknown) => void;
  t: (text: string) => string;
};

const emptyChat = (): Conversation => ({
  id: id(),
  title: "New chat",
  updatedAt: Date.now(),
  messages: [],
  draft: "",
});

export function createConversationActions({ session, persistence, queuePreferenceWrite, settingsWrite, followReply, setView, mobileDrawer, closeDrawer, searchSequence, setSearchMatch, setNotice, report, t }: ConversationDependencies) {
  const { draftTimers, writes, queueSave, updateChat, flushDraft } = persistence;
  const navigateChat = async (destination?: string, newProfile?: RequestOverrides) => {
    const current = session.get();
    if (current.navigating) return;
    session.update({ navigating: true });
    try {
      // The selection must not become visible before its outgoing draft is durable.
      const pending =
        flushDraft(current.active) ?? writes.current[current.active];
      if (pending && !(await pending)) {
        const unsaved = selectActiveChat(session.get());
        if (
          !unsaved ||
          unsaved.id !== current.active ||
          !(await queueSave(unsaved))
        )
          return;
      }
      const created = destination === undefined
        ? { ...emptyChat(), ...(newProfile ? { configOverride: newProfile } : {}) }
        : undefined;
      const target =
        created ?? session.get().threads.find(({ id }) => id === destination);
      if (!target) return;
      const saved = await queuePreferenceWrite(() =>
        created
          ? storage.createActiveConversation(created)
          : storage.saveActiveConversation(target.id),
      );
      if (!saved) return;
      followReply.current = true;
      session.update((latest) => ({
        ...(created ? { threads: [created, ...latest.threads] } : {}),
        active: target.id,
      }));
      setView("chat");
      if (mobileDrawer) closeDrawer();
      return true;
    } finally {
      session.update({ navigating: false });
    }
  };
  const create = () => void navigateChat();
  const choose = (chatId: string) => navigateChat(chatId);
  const openSearchResult = async (chatId: string, messageId?: string): Promise<string | undefined> => {
    if (!messageId) return (await navigateChat(chatId)) ? undefined : "Could not open this conversation. Your work is unchanged.";
    const initial = session.get();
    if (initial.reply || initial.processingFiles || initial.navigating) return "Finish the current reply or attachment task before opening a message result.";
    if (initial.conflicts.has(initial.active) || initial.conflicts.has(chatId) || initial.replySaves.has(initial.active) || initial.replySaves.has(chatId)) return "Save or resolve the local conflict before opening a message result.";
    const initialTarget = initial.threads.find((item) => item.id === chatId);
    if (!initialTarget?.messages.some((item) => item.id === messageId)) return "This message is no longer available.";
    const changingBranch = !activePath(initialTarget).some((item) => item.id === messageId);
    if (changingBranch && (selectActiveChat(initial)?.editState || initialTarget.editState)) return "Finish or cancel editing before changing branches.";
    session.update({ navigating: true });
    try {
      const outgoing = flushDraft(initial.active) ?? writes.current[initial.active];
      if (outgoing && !(await outgoing)) return "Could not save the current draft. Your work is unchanged.";
      if (chatId !== initial.active) {
        const pendingTarget = flushDraft(chatId) ?? writes.current[chatId];
        if (pendingTarget && !(await pendingTarget)) return "Could not save the target draft. Your work is unchanged.";
      }
      const target = session.get().threads.find((item) => item.id === chatId);
      if (!target?.messages.some((item) => item.id === messageId)) return "This message is no longer available.";
      const changed = !activePath(target).some((item) => item.id === messageId);
      const selected = changed ? selectBranch(target, messageId) : target;
      const saved = await queuePreferenceWrite(() => storage.openSearchResult(selected, changed));
      if (!saved) return "Could not open this message. Your work is unchanged.";
      followReply.current = false;
      session.update((latest) => ({ threads: changed ? latest.threads.map((item) => item.id === chatId ? selected : item) : latest.threads, active: chatId }));
      setView("chat");
      if (mobileDrawer) closeDrawer();
      setSearchMatch({ chatId, messageId, sequence: ++searchSequence.current });
      return undefined;
    } finally { session.update({ navigating: false }); }
  };
  const remove = async (chatId: string) => {
    if (
      session.get().reply ||
      session.get().processingFiles ||
      session.get().navigating ||
      !confirm(t("Delete this conversation and its saved attachments?"))
    )
      return;
    session.update({ navigating: true });
    try {
      flushDraft(chatId);
      await writes.current[chatId];
      if (session.get().conflicts.has(chatId)) return;
      const next = session.get().threads.filter((c) => c.id !== chatId);
      const active = session.get().active === chatId ? mostRecentVisible(next) : session.get().active;
      await storage.removeConversation(chatId, active);
      session.setReplySave(chatId);
      session.update({ threads: next, active });
    } catch (e) {
      report(e);
    } finally {
      session.update({ navigating: false });
    }
  };
  const organizeChat = async (chatId: string, patch: ChatOrganization) => {
    const current = session.get();
    if (current.navigating || current.conflicts.has(chatId)) return false;
    const { archived } = patch;
    if (archived === undefined)
      return updateChat(chatId, (c) => ({ ...c, ...patch }));
    if (current.reply || current.processingFiles) return false;
    const source = current.threads.find((c) => c.id === chatId);
    if (!source) return false;
    const nextActive = archived && current.active === chatId
      ? mostRecentVisible(current.threads, chatId) : undefined;
    session.update({ navigating: true });
    setNotice(archived ? "Archiving conversation…" : "Restoring conversation…");
    try {
      flushDraft(chatId);
      if (nextActive !== undefined) await settingsWrite.current;
      const saved = await queueSave({ ...source, ...patch }, nextActive);
      if (!saved) {
        setNotice("Archive change was not saved. Try again or export before reloading.");
        return false;
      }
      if (nextActive !== undefined) followReply.current = true;
      session.update((latest) => ({
        threads: latest.threads.map((c) => c.id === chatId ? { ...c, ...patch } : c),
        ...(nextActive !== undefined ? { active: nextActive } : {}),
      }));
      setNotice(archived ? "Conversation archived." : "Conversation restored.");
      return true;
    } finally {
      session.update({ navigating: false });
    }
  };
  const keepConflictCopy = async (chatId: string) => {
    const current = session.get();
    if (
      !current.conflicts.has(chatId) ||
      current.reply ||
      current.navigating ||
      current.processingFiles
    )
      return;
    session.update({ navigating: true });
    try {
      const timer = draftTimers.current.get(chatId);
      if (timer !== undefined) window.clearTimeout(timer);
      draftTimers.current.delete(chatId);
      await Promise.all([writes.current[chatId], settingsWrite.current]);
      const source = session.get().threads.find((c) => c.id === chatId);
      if (!source) return;
      const copy: Conversation = {
        ...portableConversation(source),
        id: id(),
        title: `${t("Recovered copy:")} ${source.title}`.slice(0, 160),
        updatedAt: Date.now(),
        archived: false,
        pinned: false,
        messages: source.messages.map(recoverMessage),
      };
      const activate = session.get().active === chatId;
      const original = await storage.recoverConversation(
        chatId,
        copy,
        activate,
      );
      delete writes.current[chatId];
      session.update((latest) => {
        const conflicts = new Set(latest.conflicts);
        conflicts.delete(chatId);
        const replySaves = new Map(latest.replySaves);
        replySaves.delete(chatId);
        return {
          conflicts,
          replySaves,
          ...(activate ? { active: copy.id } : {}),
          threads: [
            copy,
            ...(original ? [original] : []),
            ...latest.threads.filter((c) => c.id !== chatId),
          ],
        };
      });
      setNotice("Separate copy saved locally. The original was not changed.");
    } catch (error) {
      report(error);
    } finally {
      session.update({ navigating: false });
    }
  };
  return { navigateChat, create, choose, openSearchResult, remove, organizeChat, keepConflictCopy };
}
