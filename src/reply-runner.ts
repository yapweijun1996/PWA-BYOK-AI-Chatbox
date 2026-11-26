import { createResponseTracker, type ResponseTelemetry, type TokenPricing } from "./response-telemetry";
import { runToolTurn } from "./tool-turn";
import { streamChat } from "./providers";
import type { ToolExecution } from "./javascript-tool";
import type { RequestSnapshot } from "./request-config";
import type { Message, ProviderConfig, ProviderId } from "./types";
import type { createWorkspaceSession } from "./workspace-session";
import type { useConversationPersistence } from "./use-conversation-persistence";

export type ProviderObservation = {
  id: ProviderId; endpoint: string; model: string; credentialRevision: number;
  state: "connecting" | "succeeded" | "catalog" | "failed";
};
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
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";
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
    let content = "";
    let reasoning = "";
    let failureReason: string | undefined;
    let tracker = createResponseTracker(prepared.telemetry, prepared.pricing);
    let roundTelemetry: ReturnType<typeof tracker.snapshot> | undefined;
    const responsesReplay: import("./responses-types").ResponsesReplay = { exchanges: [], final: [] };
    let executions: ToolExecution[] = [];
    let lastCheckpoint = performance.now();
    const publish = (
      status: NonNullable<Message["status"]>,
      persist: boolean,
    ) => {
      if (!isCurrentReply(abort)) return;
      if (status === "streaming" && session.get().reply?.phase === "finalizing") return;
      const message: Message = {
        ...prepared.message,
        content,
        reasoning,
        status,
        ...(status === "error" && failureReason ? { error: failureReason } : {}),
        telemetry: roundTelemetry ?? tracker.snapshot(),
        ...(executions.length ? { toolExecutions: executions } : {}),
        ...(prepared.target.id === "openai" && prepared.target.openaiApi === "responses" && status === "complete" ? { responsesReplay } : {}),
      };
      if (status !== "streaming")
        session.setReplySave(chatId, { message, status: "pending" });
      return updateChat(
        chatId,
        (c) => ({
          ...c,
          ...(status === "complete" ? { updatedAt: Date.now() } : {}),
          messages: c.messages.map((m) => m.id === message.id ? message : m),
        }),
        persist,
      );
    };
    const publishStream = () => {
      const now = performance.now();
      const checkpoint = now - lastCheckpoint >= 500;
      if (checkpoint) lastCheckpoint = now;
      publish("streaming", checkpoint);
    };
    const timer = window.setInterval(() => {
      if (!abort.signal.aborted) publish("streaming", false);
    }, 500);
    let terminal: "complete" | "interrupted" | "error";
    try {
      await runToolTurn(
        async (tool) => {
          tracker = createResponseTracker(prepared.telemetry, prepared.pricing);
          roundTelemetry = undefined;
          let firstText = true;
          let firstReasoning = true;
          const observation = {
            id: prepared.target.id,
            endpoint: prepared.target.endpoint,
            model: prepared.target.model,
            credentialRevision: prepared.credentialRevision,
          };
          const observationSequence = ++providerObservationSequence.current;
          setProviderObservation({ ...observation, state: "connecting" });
          let round: Awaited<ReturnType<typeof streamChat>>;
          try {
            round = await streamChat(
              prepared.target,
              prepared.secret,
              history,
              abort.signal,
              (text) => {
                if (!isCurrentReply(abort) || abort.signal.aborted) return;
                tracker.visible(text);
                if (firstText && content) content += "\n\n";
                firstText = false;
                content += text;
                publishStream();
              },
              (text) => {
                if (!isCurrentReply(abort) || abort.signal.aborted) return;
                if (firstReasoning && reasoning) reasoning += "\n\n";
                firstReasoning = false;
                reasoning += text;
                publishStream();
              },
              (sample, receivedAt) => {
                if (
                  isCurrentReply(abort) &&
                  !abort.signal.aborted &&
                  tracker.receive(sample, receivedAt)
                )
                  publishStream();
              },
              tool,
              (items) => { responsesReplay.final = items; },
            );
            if (
              !abort.signal.aborted &&
              providerObservationSequence.current === observationSequence
            )
              setProviderObservation({ ...observation, state: "succeeded" });
          } catch (error) {
            if (providerObservationSequence.current === observationSequence) {
              if (!abort.signal.aborted)
                setProviderObservation({ ...observation, state: "failed" });
              else setProviderObservation(undefined);
            }
            throw error;
          }
          roundTelemetry = tracker.snapshot();
          return round;
        },
        prepared.request.javascript === true,
        abort.signal,
        (record) => {
          if (!isCurrentReply(abort)) return;
          executions = executions.some(({ id }) => id === record.id)
            ? executions.map((prior) =>
                prior.id === record.id ? record : prior,
              )
            : [...executions, record];
          publish("streaming", true);
        },
        history.flatMap((message) => message.role === "user" ? message.attachments ?? [] : []),
        ({ round, results }) => {
          if (round.responsesItems) { responsesReplay.exchanges.push({ items: round.responsesItems, results }); responsesReplay.final = []; }
        },
      );
      terminal = abort.signal.aborted ? "interrupted" : "complete";
    } catch (e) {
      terminal = abort.signal.aborted ? "interrupted" : "error";
      if (isCurrentReply(abort) && terminal === "error") {
        failureReason = errorText(e);
      }
    } finally {
      // Stop the streaming heartbeat before waiting on disk, including on Stop/error.
      window.clearInterval(timer);
    }
    const finishing = session.get().reply;
    if (finishing?.controller !== abort) return;
    session.update({ reply: { ...finishing, phase: "finalizing" } });
    try {
      await publish(terminal, true);
    } finally {
      finishReply(abort);
    }
  };
}
