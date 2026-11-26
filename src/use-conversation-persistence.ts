import { useCallback, useRef } from "react";
import { ConversationConflictError, storage } from "./storage";
import type { Conversation } from "./types";
import type { createWorkspaceSession } from "./workspace-state";

// One queue per conversation preserves ordering across edits, saves, and imports.
export function useConversationPersistence(session: ReturnType<typeof createWorkspaceSession>, report: (error: unknown) => void) {
  const draftTimers = useRef(new Map<string, number>());
  const writes = useRef<Partial<Record<string, Promise<boolean>>>>(Object.create(null));
  const queueSave = useCallback(
    (chat: Conversation, nextActive?: string) => {
      const timer = draftTimers.current.get(chat.id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        draftTimers.current.delete(chat.id);
      }
      const tracked = session.get().replySaves.get(chat.id)?.message;
      // An older streaming checkpoint cannot acknowledge the terminal message.
      const final =
        tracked && chat.messages.includes(tracked) ? tracked : undefined;
      if (final)
        session.setReplySave(chat.id, { message: final, status: "pending" });
      const previous = writes.current[chat.id] || Promise.resolve();
      const write: Promise<boolean> = previous
        .then(() => {
          if (session.get().conflicts.has(chat.id))
            throw new ConversationConflictError(chat.id);
          return storage.saveConversation(chat, nextActive);
        })
        .then(
          () => {
            if (
              final &&
              session.get().replySaves.get(chat.id)?.message === final
            )
              session.setReplySave(chat.id);
            return true;
          },
          (error) => {
            if (
              final &&
              writes.current[chat.id] === write &&
              session.get().replySaves.get(chat.id)?.message === final
            )
              session.setReplySave(chat.id, {
                message: final,
                status: "failed",
              });
            report(error);
            return false;
          },
        );
      writes.current[chat.id] = write;
      return write;
    },
    [report, session],
  );
  const updateChat = useCallback(
    (chatId: string, fn: (c: Conversation) => Conversation, persist = true) => {
      let changed: Conversation | undefined;
      const next = session.get().threads.map((c) => {
        if (c.id !== chatId) return c;
        changed = fn(c);
        return changed;
      });
      if (changed) session.update({ threads: next });
      return changed && persist ? queueSave(changed) : Promise.resolve(Boolean(changed));
    },
    [queueSave, session],
  );
  const flushDraft = useCallback(
    (chatId: string) => {
      const timer = draftTimers.current.get(chatId);
      if (timer === undefined) return;
      window.clearTimeout(timer);
      draftTimers.current.delete(chatId);
      const latest = session.get().threads.find((chat) => chat.id === chatId);
      return latest && queueSave(latest);
    },
    [queueSave, session],
  );
  const flushDrafts = useCallback(() => {
    for (const chatId of draftTimers.current.keys()) flushDraft(chatId);
  }, [flushDraft]);
  return { draftTimers, writes, queueSave, updateChat, flushDraft, flushDrafts };
}
