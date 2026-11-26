import { activateBranch, asBranchConversation, pathTo, removeBranch, selectBranch } from "./branches";
import { cloudRecipient, needsHistoryChoice } from "./history-sharing";
import { requestHistory } from "./provider-request";
import { profileOverride, resolveConfig, type ResolvedConfig, type RequestSnapshot } from "./request-config";
import type { PreparedReply, createReplyRunner } from "./reply-runner";
import { id, type Attachment, type Conversation, type Message, type ProviderConfig, type ProviderId, type Settings } from "./types";
import type { useConversationPersistence } from "./use-conversation-persistence";
import type { createWorkspaceSession } from "./workspace-session";

type MessageActionDependencies = {
  session: ReturnType<typeof createWorkspaceSession>;
  chat: Conversation | undefined;
  settings: Settings;
  files: Attachment[];
  effective: ResolvedConfig;
  draftHistory: Message[];
  isConfigured: boolean;
  sendBlocked: string | undefined;
  blockedFor: (config: ProviderConfig, history?: Message[]) => string | undefined;
  configured: (config: ProviderConfig) => boolean;
  canStartReply: (chat: Conversation | undefined) => boolean;
  askToShareHistory: (chat: Conversation, config: ProviderConfig) => Promise<boolean>;
  followReply: { current: boolean };
  prepareReply: (config: ResolvedConfig, history: Message[]) => PreparedReply;
  beginReply: (id: string, request: RequestSnapshot, draft: Conversation | null) => AbortController;
  updateChat: ReturnType<typeof useConversationPersistence>["updateChat"];
  queueSave: ReturnType<typeof useConversationPersistence>["queueSave"];
  finishReply: (controller: AbortController) => void;
  runReply: ReturnType<typeof createReplyRunner>;
  setNotice: (text: string) => void;
  openProvider: (id: ProviderId) => void;
};

/** Start or switch a message branch only after the relevant local write succeeds. */
export function createMessageActions({ session, chat, settings, files, effective, draftHistory, isConfigured, sendBlocked, blockedFor, configured, canStartReply, askToShareHistory, followReply, prepareReply, beginReply, updateChat, queueSave, finishReply, runReply, setNotice, openProvider }: MessageActionDependencies) {
  const send = async () => {
    if (!canStartReply(chat)) return;
    if (!chat) {
      setNotice("Start a new chat first.");
      return;
    }
    if (!chat.draft.trim() && !files.length) return;
    if (!isConfigured) {
      setNotice(
        "Choose a model and enter your key in Providers. LM Studio does not require a key unless authentication is enabled.",
      );
      openProvider(effective.config.id);
      return;
    }
    if (sendBlocked) {
      setNotice(sendBlocked);
      return;
    }
    if (needsHistoryChoice(chat, effective.config.id, draftHistory) &&
      !(await askToShareHistory(chat, effective.config))) return;
    followReply.current = true;
    const tree = asBranchConversation(chat);
    const source = chat.editState && tree.messages.find((message) => message.id === chat.editState?.sourceId);
    if (chat.editState && !source) { setNotice("The edited message is no longer available."); return; }
    const parentId = source ? source.parentId ?? null : tree.activeMessageId;
    const user: Message = {
      id: id(),
      parentId,
      role: "user",
      content: chat.draft,
      attachments: files,
      createdAt: Date.now(),
      status: "complete",
    };
    const history = [...pathTo(tree, parentId), user];
    const prepared = prepareReply(effective, history);
    const reply = prepared.message;
    reply.parentId = user.id;
    const chatId = chat.id;
    const nextTitle =
      chat.title === "New chat"
        ? chat.draft.trim().slice(0, 60) || files[0]?.name || "New chat"
        : chat.title;
    const abort = beginReply(chatId, prepared.request, chat);
    const saved = await updateChat(chatId, (c) => activateBranch({
      ...c,
      branchVersion: 1,
      preferredBranches: tree.preferredBranches,
      activeMessageId: reply.id,
      title: nextTitle,
      cloudHistoryRecipient: cloudRecipient(prepared.target.id),
      cloudHistoryKnownIds: prepared.target.id === "lmstudio" ? undefined : [...new Set([...(chat.cloudHistoryRecipient === prepared.target.id ? chat.cloudHistoryKnownIds ?? [] : []), ...requestHistory(history).map((message) => message.id), reply.id])],
      draft: "",
      draftAttachments: [],
      editState: undefined,
      updatedAt: Date.now(),
      messages: [...tree.messages, user, reply],
    }, reply.id));
    if (!saved) {
      updateChat(chatId, (c) => ({
        ...c,
        title: c.title === nextTitle ? chat.title : c.title,
        cloudHistoryRecipient: chat.cloudHistoryRecipient,
        cloudHistoryKnownIds: chat.cloudHistoryKnownIds,
        draft: c.draft ? `${user.content}\n${c.draft}` : user.content,
        draftAttachments: [
          ...(user.attachments || []),
          ...(c.draftAttachments || []),
        ],
        editState: chat.editState,
        messages: chat.messages,
        branchVersion: chat.branchVersion,
        activeMessageId: chat.activeMessageId,
        preferredBranches: chat.preferredBranches,
      }));
      finishReply(abort);
      if (session.get().conflicts.has(chatId)) return;
      setNotice(
        "Message was not sent because local storage failed. Your draft and attachments are still visible.",
      );
      return;
    }
    await runReply(chatId, history, prepared, abort);
  };
  const retry = async (original?: RequestSnapshot, messageId?: string) => {
    if (!chat || !canStartReply(chat)) return;
    if (chat.editState) { setNotice("Finish or cancel editing before changing branches."); return; }
    const tree = asBranchConversation(chat);
    const targetMessage = tree.messages.find((message) => message.id === (messageId ?? tree.activeMessageId));
    if (!targetMessage || targetMessage.role !== "assistant" || targetMessage.status === "streaming") return;
    const history = pathTo(tree, targetMessage.parentId);
    const resolved = original
      ? resolveConfig(
          settings,
          chat.configOverride,
          profileOverride({ ...original, id: original.provider }),
        )
      : effective;
    const blocked = blockedFor(resolved.config, history);
    if (blocked) {
      setNotice(blocked);
      return;
    }
    if (!configured(resolved.config)) {
      setNotice("Set up a model and provider credentials before sending.");
      openProvider(resolved.config.id);
      return;
    }
    if (needsHistoryChoice(chat, resolved.config.id, history) &&
      !(await askToShareHistory(chat, resolved.config))) return;
    const prepared = prepareReply(resolved, history);
    const reply = prepared.message;
    reply.parentId = targetMessage.parentId ?? null;
    const abort = beginReply(chat.id, prepared.request, null);
    const saved = await updateChat(chat.id, (c) => activateBranch({
      ...c,
      branchVersion: 1,
      preferredBranches: tree.preferredBranches,
      activeMessageId: reply.id,
      messages: [...tree.messages, reply],
      cloudHistoryRecipient: cloudRecipient(prepared.target.id),
      cloudHistoryKnownIds: prepared.target.id === "lmstudio" ? undefined : [...new Set([...(chat.cloudHistoryRecipient === prepared.target.id ? chat.cloudHistoryKnownIds ?? [] : []), ...requestHistory(history).map((message) => message.id), reply.id])],
      updatedAt: Date.now(),
    }, reply.id));
    if (!saved) {
      updateChat(chat.id, (c) => ({
        ...c,
        messages: chat.messages,
        branchVersion: chat.branchVersion,
        activeMessageId: chat.activeMessageId,
        preferredBranches: chat.preferredBranches,
        cloudHistoryRecipient: chat.cloudHistoryRecipient,
        cloudHistoryKnownIds: chat.cloudHistoryKnownIds,
      }));
      finishReply(abort);
      if (session.get().conflicts.has(chat.id)) return;
      setNotice(
        "Retry was not sent because local storage failed. The conversation remains visible.",
      );
      return;
    }
    await runReply(chat.id, history, prepared, abort);
  };
  const editMessage = async (message: Message) => {
    if (!chat || message.role !== "user" || !canStartReply(chat)) return;
    const saved = await updateChat(chat.id, (current) => ({
      ...current,
      draft: message.content,
      draftAttachments: [...(message.attachments || [])],
      editState: { sourceId: message.id, originalDraft: current.editState?.originalDraft ?? current.draft, originalAttachments: current.editState?.originalAttachments ?? [...(current.draftAttachments || [])] },
    }));
    if (saved) document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };
  const cancelEdit = async () => {
    if (!chat?.editState || !canStartReply(chat)) return;
    const snapshot = chat.editState;
    const saved = await updateChat(chat.id, (current) => ({ ...current, draft: snapshot.originalDraft, draftAttachments: snapshot.originalAttachments, editState: undefined }));
    if (saved) document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };
  const changeBranch = async (messageId: string, deleting = false) => {
    if (!chat || !canStartReply(chat)) return;
    if (chat.editState) { setNotice("Finish or cancel editing before changing branches."); return; }
    if (!chat.messages.some((message) => message.id === messageId)) return;
    session.update({ navigating: true });
    try {
      const selected = deleting ? removeBranch(chat, messageId) : selectBranch(chat, messageId);
      // Keep the old branch visible until the selection/deletion is durable.
      if (await queueSave(selected)) {
        followReply.current = true;
        session.update((current) => ({ threads: current.threads.map((item) => item.id === chat.id ? selected : item) }));
      }
    } finally { session.update({ navigating: false }); }
  };
  return { send, retry, editMessage, cancelEdit, changeBranch };
}
