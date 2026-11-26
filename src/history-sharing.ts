import { requestHistory } from "./provider-request";
import { activePath } from "./branches";
import type { Message } from "./types";
import type { Conversation, ProviderId } from "./types";

export type HistoryChoice = "cancel" | "fresh" | "share";

export function cloudRecipient(provider: ProviderId) {
  return provider === "lmstudio" ? undefined : provider;
}

export function needsHistoryChoice(chat: Conversation, provider: ProviderId, history: readonly Message[] = activePath(chat)) {
  const sent = requestHistory(history);
  const known = new Set(chat.cloudHistoryKnownIds ?? []);
  return (
    provider !== "lmstudio" &&
    sent.length > 0 &&
    (chat.cloudHistoryRecipient !== provider || sent.some((message) => !known.has(message.id)))
  );
}

// Apply on both export and import: a file cannot grant permission for a device.
export function portableConversation(
  chat: Conversation & { localRevision?: unknown },
): Conversation {
  const {
    cloudHistoryRecipient: _localConsent,
    cloudHistoryKnownIds: _localKnown,
    localRevision: _deviceOnly,
    ...portable
  } = chat;
  return portable;
}
