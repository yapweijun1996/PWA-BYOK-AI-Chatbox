import { requestHistory } from "./providers";
import type { Conversation, ProviderId } from "./types";

export type HistoryChoice = "cancel" | "fresh" | "share";

export function cloudRecipient(provider: ProviderId) {
  return provider === "lmstudio" ? undefined : provider;
}

export function needsHistoryChoice(chat: Conversation, provider: ProviderId) {
  return (
    provider !== "lmstudio" &&
    chat.cloudHistoryRecipient !== provider &&
    requestHistory(chat.messages).length > 0
  );
}

// Apply on both export and import: a file cannot grant permission for a device.
export function portableConversation(
  chat: Conversation & { localRevision?: unknown },
): Conversation {
  const {
    cloudHistoryRecipient: _localConsent,
    localRevision: _deviceOnly,
    ...portable
  } = chat;
  return portable;
}
