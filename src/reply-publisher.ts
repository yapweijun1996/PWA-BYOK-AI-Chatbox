import type { Message } from "./types";
import type { createWorkspaceSession } from "./workspace-session";
import type { useConversationPersistence } from "./use-conversation-persistence";

type ReplyStatus = NonNullable<Message["status"]>;
type Dependencies = {
  chatId: string;
  controller: AbortController;
  session: ReturnType<typeof createWorkspaceSession>;
  isCurrentReply: (controller: AbortController) => boolean;
  updateChat: ReturnType<typeof useConversationPersistence>["updateChat"];
  finishReply: (controller: AbortController) => void;
  buildMessage: (status: ReplyStatus) => Message;
};

/** Publishes through the existing conversation queue, without creating another save queue. */
export function createReplyPublisher({ chatId, controller, session, isCurrentReply, updateChat, finishReply, buildMessage }: Dependencies) {
  let lastCheckpoint = performance.now();
  let timer: number | undefined;
  const publish = (status: ReplyStatus, persist: boolean) => {
    if (!isCurrentReply(controller)) return;
    if (status === "streaming" && session.get().reply?.phase === "finalizing") return;
    const message = buildMessage(status);
    if (status !== "streaming") session.setReplySave(chatId, { message, status: "pending" });
    return updateChat(chatId, (conversation) => ({
      ...conversation,
      ...(status === "complete" ? { updatedAt: Date.now() } : {}),
      messages: conversation.messages.map((item) => item.id === message.id ? message : item),
    }), persist);
  };
  return {
    publish,
    checkpoint() {
      const now = performance.now();
      const persist = now - lastCheckpoint >= 500;
      if (persist) lastCheckpoint = now;
      publish("streaming", persist);
    },
    start() {
      timer = window.setInterval(() => {
        if (!controller.signal.aborted) publish("streaming", false);
      }, 500);
    },
    stop() {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    },
    async finish(status: "complete" | "interrupted" | "error") {
      const finishing = session.get().reply;
      if (finishing?.controller !== controller) return;
      session.update({ reply: { ...finishing, phase: "finalizing" } });
      try {
        await publish(status, true);
      } finally {
        finishReply(controller);
      }
    },
  };
}
