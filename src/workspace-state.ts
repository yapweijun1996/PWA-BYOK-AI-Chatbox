import { useState, useSyncExternalStore } from "react";
import type { InitialAppState } from "./startup";
import { createWorkspaceSession } from "./workspace-session";
export { createWorkspaceSession, selectActiveChat } from "./workspace-session";
export type { ActiveReply, ReplySave } from "./workspace-session";

export function useWorkspaceSession(initial: InitialAppState) {
  const [session] = useState(() => createWorkspaceSession(initial));
  return {
    session,
    state: useSyncExternalStore(session.subscribe, session.get),
  };
}
