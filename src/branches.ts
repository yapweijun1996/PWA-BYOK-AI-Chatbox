import type { Conversation, Message } from "./types";

// The empty string identifies the virtual root; real IDs are nonempty.
const key = (parent: string | null) => parent ?? "";
export type BranchConversation = Conversation & {
  branchVersion: 1;
  activeMessageId: string | null;
  preferredBranches: Record<string, string>;
};

export function asBranchConversation(chat: Conversation): BranchConversation {
  if (chat.branchVersion === 1) return chat as BranchConversation;
  let previous: string | null = null;
  let lastUser: string | null = null;
  let lastComplete: string | null = null;
  let precedingAssistant = false;
  const preferred: Record<string, string> = Object.create(null);
  const messages = chat.messages.map((message) => {
    let parentId = previous;
    if (message.role === "user") {
      if (precedingAssistant) parentId = lastComplete ?? lastUser;
      lastUser = message.id;
      lastComplete = null;
    } else if (precedingAssistant && lastUser) parentId = lastUser;
    if (message.role === "assistant" && message.status === "complete")
      lastComplete = message.id;
    precedingAssistant = message.role === "assistant";
    previous = message.id;
    preferred[key(parentId)] = message.id;
    return { ...message, parentId };
  });
  return {
    ...chat,
    messages,
    branchVersion: 1,
    activeMessageId: previous,
    preferredBranches: preferred,
  };
}

export function pathTo(
  chat: Conversation,
  id: string | null | undefined,
): Message[] {
  const tree = asBranchConversation(chat);
  const byId = new Map(tree.messages.map((message) => [message.id, message]));
  const result: Message[] = [];
  const seen = new Set<string>();
  let cursor = id ?? null;
  while (cursor) {
    if (seen.has(cursor)) throw new Error("Invalid message branch.");
    seen.add(cursor);
    const message = byId.get(cursor);
    if (!message) throw new Error("Invalid message branch.");
    result.push(message);
    cursor = message.parentId ?? null;
  }
  return result.reverse();
}
export function activePath(chat: Conversation): Message[] {
  const tree = asBranchConversation(chat);
  return pathTo(tree, tree.activeMessageId);
}
export function siblings(chat: Conversation, message: Message): Message[] {
  const tree = asBranchConversation(chat);
  const actual = tree.messages.find((item) => item.id === message.id);
  return actual
    ? tree.messages.filter(
        (item) =>
          item.parentId === actual.parentId && item.role === actual.role,
      )
    : [];
}
export function versionGroups(chat: Conversation): Map<string, Message[]> {
  const groups = new Map<string, Message[]>();
  for (const message of asBranchConversation(chat).messages) {
    const groupKey = JSON.stringify([message.parentId ?? null, message.role]);
    const group = groups.get(groupKey) ?? [];
    group.push(message);
    groups.set(groupKey, group);
  }
  const byId = new Map<string, Message[]>();
  for (const group of groups.values())
    for (const message of group) byId.set(message.id, group);
  return byId;
}
export function selectBranch(
  chat: Conversation,
  id: string,
): BranchConversation {
  const tree = asBranchConversation(chat);
  if (!tree.messages.some((message) => message.id === id))
    throw new Error("Invalid message branch.");
  const childrenByParent = new Map<string, Message[]>();
  for (const message of tree.messages) {
    if (!message.parentId) continue;
    const children = childrenByParent.get(message.parentId) ?? [];
    children.push(message);
    childrenByParent.set(message.parentId, children);
  }
  let current = id;
  for (;;) {
    const children = childrenByParent.get(current) ?? [];
    if (!children.length) break;
    const preferred = Object.prototype.hasOwnProperty.call(
      tree.preferredBranches,
      current,
    )
      ? tree.preferredBranches[current]
      : undefined;
    current =
      children.find((message) => message.id === preferred)?.id ??
      children[children.length - 1].id;
  }
  return activateBranch(tree, current);
}
export function activateBranch(
  chat: Conversation,
  id: string | null,
): BranchConversation {
  const tree = asBranchConversation(chat);
  const path = pathTo(tree, id);
  const preferredBranches: Record<string, string> = Object.assign(
    Object.create(null),
    tree.preferredBranches,
  );
  for (const message of path)
    preferredBranches[key(message.parentId ?? null)] = message.id;
  return { ...tree, activeMessageId: id, preferredBranches };
}
export function branchDescendants(chat: Conversation, id: string): Set<string> {
  const tree = asBranchConversation(chat);
  const deleted = new Set([id]);
  for (const message of tree.messages)
    if (message.parentId && deleted.has(message.parentId))
      deleted.add(message.id);
  return deleted;
}
export function removeBranch(
  chat: Conversation,
  id: string,
): BranchConversation {
  const tree = asBranchConversation(chat);
  const target = tree.messages.find((message) => message.id === id);
  if (!target) throw new Error("Invalid message branch.");
  const removed = branchDescendants(tree, id);
  const messages = tree.messages.filter((message) => !removed.has(message.id));
  const preferredBranches = Object.fromEntries(
    Object.entries(tree.preferredBranches).filter(
      ([parent, child]) => !removed.has(parent) && !removed.has(child),
    ),
  );
  let result: BranchConversation = {
    ...tree,
    messages,
    preferredBranches,
    cloudHistoryKnownIds: tree.cloudHistoryKnownIds?.filter(
      (messageId) => !removed.has(messageId),
    ),
    activeMessageId: removed.has(tree.activeMessageId ?? "")
      ? (target.parentId ?? null)
      : tree.activeMessageId,
  };
  if (removed.has(tree.activeMessageId ?? "")) {
    const alternatives = messages.filter(
      (message) =>
        message.parentId === target.parentId && message.role === target.role,
    );
    if (alternatives.length)
      result = selectBranch(result, alternatives[alternatives.length - 1].id);
    else result = activateBranch(result, target.parentId ?? null);
  }
  return result;
}
export function validBranchConversation(chat: Conversation): boolean {
  if (chat.branchVersion === undefined)
    return (
      chat.activeMessageId === undefined &&
      chat.preferredBranches === undefined &&
      chat.messages.every((message) => message.parentId === undefined)
    );
  if (
    chat.branchVersion !== 1 ||
    !chat.preferredBranches ||
    typeof chat.preferredBranches !== "object" ||
    Array.isArray(chat.preferredBranches)
  )
    return false;
  const seen = new Set<string>();
  for (const message of chat.messages) {
    if (
      message.parentId !== null &&
      (typeof message.parentId !== "string" || !seen.has(message.parentId))
    )
      return false;
    seen.add(message.id);
  }
  if (
    chat.activeMessageId !== null &&
    (typeof chat.activeMessageId !== "string" ||
      !seen.has(chat.activeMessageId))
  )
    return false;
  const byId = new Map(chat.messages.map((message) => [message.id, message]));
  return Object.entries(chat.preferredBranches).every(
    ([parent, child]) =>
      typeof child === "string" &&
      byId.get(child)?.parentId === (parent || null),
  );
}
