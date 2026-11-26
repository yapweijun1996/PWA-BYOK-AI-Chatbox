import type { InitialAppState } from "./startup";
import type { Conversation, Message } from "./types";
import type { RequestSnapshot } from "./request-config";

export type ActiveReply = Readonly<{
  phase: "saving" | "streaming" | "stopping" | "finalizing";
  conversationId: string;
  controller: AbortController;
  draft: Conversation | null;
  request: RequestSnapshot;
}>;
export type ReplySave = Readonly<{
  message: Message;
  status: "pending" | "failed";
}>;
type State = InitialAppState & {
  reply: ActiveReply | null;
  // Only uncommitted terminal replies are tracked. Never persist or export this map.
  replySaves: ReadonlyMap<string, ReplySave>;
  conflicts: ReadonlySet<string>;
  processingFiles: boolean;
  navigating: boolean;
};

// The session is a projection of IndexedDB plus uncommitted drafts and in-flight work.
// Input handlers and React subscribe to the same snapshot; no separate mutable chat mirror.
export function createWorkspaceSession(initial: InitialAppState) {
  let current: State = {
    ...initial,
    reply: null,
    replySaves: new Map(),
    conflicts: new Set(),
    processingFiles: false,
    navigating: false,
  };
  const listeners = new Set<() => void>();
  function update(patch: Partial<State> | ((state: State) => Partial<State>)) {
    const values = typeof patch === "function" ? patch(current) : patch;
    current = { ...current, ...values };
    for (const listener of listeners) listener();
  }
  return {
    get: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    setReplySave(chatId: string, save?: ReplySave) {
      const old = current.replySaves.get(chatId);
      if (old?.message === save?.message && old?.status === save?.status)
        return;
      const replySaves = new Map(current.replySaves);
      if (save) replySaves.set(chatId, save);
      else replySaves.delete(chatId);
      update({ replySaves });
    },
  };
}

export function selectActiveChat(state: InitialAppState) {
  return state.threads.find(({ id }) => id === state.active);
}
