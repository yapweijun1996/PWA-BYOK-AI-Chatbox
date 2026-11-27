import { createResponseTracker, type ResponseTelemetry, type TokenPricing } from "./response-telemetry";
import type { ToolExecution } from "./javascript-tool";
import type { ToolExchange } from "./provider-tool-types";
import type { ResponsesReplay, OutputItem } from "./responses-types";
import type { Message, ProviderConfig } from "./types";

/** Holds generated state only; persistence and provider transport remain external. */
export function createReplyStreamState(message: Message, target: Readonly<ProviderConfig>, telemetry: ResponseTelemetry, pricing: TokenPricing | undefined, isActive: () => boolean, checkpoint: () => void) {
  let content = "", reasoning = "";
  let failureReason: string | undefined;
  let tracker = createResponseTracker(telemetry, pricing);
  let roundTelemetry: ReturnType<typeof tracker.snapshot> | undefined;
  const responsesReplay: ResponsesReplay = { exchanges: [], final: [] };
  let executions: ToolExecution[] = [];
  return {
    beginRound() {
      tracker = createResponseTracker(telemetry, pricing);
      roundTelemetry = undefined;
      let firstText = true, firstReasoning = true;
      return {
        onText(text: string) {
          if (!isActive()) return;
          tracker.visible(text);
          if (firstText && content) content += "\n\n";
          firstText = false;
          content += text;
          checkpoint();
        },
        onReasoning(text: string) {
          if (!isActive()) return;
          if (firstReasoning && reasoning) reasoning += "\n\n";
          firstReasoning = false;
          reasoning += text;
          checkpoint();
        },
        onSample(sample: Parameters<typeof tracker.receive>[0], receivedAt: number) {
          if (isActive() && tracker.receive(sample, receivedAt)) checkpoint();
        },
        onResponsesOutput(items: OutputItem[]) { responsesReplay.final = items; },
        complete() { roundTelemetry = tracker.snapshot(); },
      };
    },
    progress(record: ToolExecution) {
      executions = executions.some(({ id }) => id === record.id)
        ? executions.map((prior) => prior.id === record.id ? record : prior)
        : [...executions, record];
    },
    exchange({ round, results }: ToolExchange) {
      if (round.responsesItems) { responsesReplay.exchanges.push({ items: round.responsesItems, results }); responsesReplay.final = []; }
    },
    fail(error: unknown) { failureReason = error instanceof Error ? error.message : "Something went wrong."; },
    message(status: NonNullable<Message["status"]>): Message {
      return {
        ...message, content, reasoning, status,
        ...(status === "error" && failureReason ? { error: failureReason } : {}),
        telemetry: roundTelemetry ?? tracker.snapshot(),
        ...(executions.length ? { toolExecutions: executions } : {}),
        ...(target.id === "openai" && target.openaiApi === "responses" && status === "complete" ? { responsesReplay } : {}),
      };
    },
  };
}
