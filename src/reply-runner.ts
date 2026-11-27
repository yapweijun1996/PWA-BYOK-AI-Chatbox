import { type ResponseTelemetry, type TokenPricing } from "./response-telemetry";
import { runToolTurn } from "./tool-turn";
import { createReplyPublisher } from "./reply-publisher";
import { streamChat } from "./providers";
import { createReplyStreamState } from "./reply-stream-state";
import { observeProviderRound, type ProviderObservation } from "./provider-observation";
export type { ProviderObservation } from "./provider-observation";
import type { RequestSnapshot } from "./request-config";
import type { Message, ProviderConfig } from "./types";
import type { createWorkspaceSession } from "./workspace-session";
import type { useConversationPersistence } from "./use-conversation-persistence";

export type PreparedReply = {
  message: Message; request: RequestSnapshot; telemetry: ResponseTelemetry;
  target: Readonly<ProviderConfig>; pricing?: TokenPricing; secret: string; credentialRevision: number;
};
type ReplyRunnerDependencies = {
  session: ReturnType<typeof createWorkspaceSession>;
  setNotice: (message: string) => void;
  isCurrentReply: (controller: AbortController) => boolean;
  updateChat: ReturnType<typeof useConversationPersistence>["updateChat"];
  providerObservationSequence: { current: number };
  setProviderObservation: (value: ProviderObservation | undefined) => void;
  finishReply: (controller: AbortController) => void;
};
export function createReplyRunner({ session, setNotice, isCurrentReply, updateChat, providerObservationSequence, setProviderObservation, finishReply }: ReplyRunnerDependencies) {
  return async (
    chatId: string,
    history: Message[],
    prepared: PreparedReply,
    abort: AbortController,
  ) => {
    const current = session.get().reply;
    if (current?.controller !== abort) return;
    session.update({ reply: { ...current, phase: "streaming", draft: null } });
    setNotice("");
    const state = createReplyStreamState(prepared.message, prepared.target, prepared.telemetry, prepared.pricing, () => isCurrentReply(abort) && !abort.signal.aborted, () => publisher.checkpoint());
    const publisher = createReplyPublisher({
      chatId, controller: abort, session, isCurrentReply, updateChat, finishReply,
      buildMessage: state.message,
    });
    publisher.start();
    let terminal: "complete" | "interrupted" | "error";
    try {
      await runToolTurn(
        async (tool) => {
          const round = state.beginRound();
          const result = await observeProviderRound(prepared.target, prepared.credentialRevision, abort.signal, providerObservationSequence, setProviderObservation, () => streamChat(
            prepared.target, prepared.secret, history, abort.signal,
            round.onText, round.onReasoning, round.onSample, tool, round.onResponsesOutput,
          ));
          round.complete();
          return result;
        },
        prepared.request.javascript === true,
        abort.signal,
        (record) => {
          if (!isCurrentReply(abort)) return;
          state.progress(record);
          publisher.publish("streaming", true);
        },
        history.flatMap((message) => message.role === "user" ? message.attachments ?? [] : []),
        state.exchange,
      );
      terminal = abort.signal.aborted ? "interrupted" : "complete";
    } catch (e) {
      terminal = abort.signal.aborted ? "interrupted" : "error";
      if (isCurrentReply(abort) && terminal === "error") {
        state.fail(e);
      }
    } finally {
      // Stop the streaming heartbeat before waiting on disk, including on Stop/error.
      publisher.stop();
    }
    await publisher.finish(terminal);
  };
}
