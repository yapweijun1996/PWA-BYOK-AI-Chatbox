import { parseEventStream } from "./event-stream";
import { collectResponsesEvents } from "./responses-stream-events";

/** Transport is injected so tests and callers control credentials, endpoint and network policy. */
export async function streamResponsesPrototype(
  send: (body: object, signal: AbortSignal) => Promise<Response>,
  body: object,
  signal: AbortSignal,
  onText: (text: string) => void,
  onSummary: (text: string) => void,
) {
  signal.throwIfAborted();
  const response = await send(body, signal);
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}.`);
  if (!response.body)
    throw new Error("The provider returned an empty response.");
  const collector = collectResponsesEvents(onText, onSummary);
  await parseEventStream(response.body, (data) => {
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error(
        "The provider returned invalid streaming data. Partial output was retained.",
      );
    }
    collector.push(event);
  });
  signal.throwIfAborted();
  return collector.finish();
}
