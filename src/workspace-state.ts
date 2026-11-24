import { useState, useSyncExternalStore } from "react";
import type { InitialAppState } from "./startup";
import type { Conversation } from "./types";
import type { RequestSnapshot } from "./request-config";

export type ActiveReply = Readonly<{
  phase: "saving" | "streaming" | "stopping";
  conversationId: string;
  controller: AbortController;
  draft: Conversation | null;
  request: RequestSnapshot;
}>;
type State = InitialAppState & {
  reply: ActiveReply | null;
  processingFiles: boolean;
};

// The session is a projection of IndexedDB plus uncommitted drafts and in-flight work.
// Input handlers and React subscribe to the same snapshot; no separate mutable chat mirror.
export function createWorkspaceSession(initial: InitialAppState) {
  let current: State = { ...initial, reply: null, processingFiles: false };
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(patch: Partial<State> | ((state: State) => Partial<State>)) {
      const values = typeof patch === "function" ? patch(current) : patch;
      current = { ...current, ...values };
      for (const listener of listeners) listener();
    },
  };
}

export function useWorkspaceSession(initial: InitialAppState) {
  const [session] = useState(() => createWorkspaceSession(initial));
  return {
    session,
    state: useSyncExternalStore(session.subscribe, session.get),
  };
}

export function selectActiveChat(state: InitialAppState) {
  return state.threads.find(({ id }) => id === state.active);
}
