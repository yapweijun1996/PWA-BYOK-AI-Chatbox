import type { ProviderConfig, ProviderId } from "./types";

export type ProviderObservation = {
  id: ProviderId; endpoint: string; model: string; credentialRevision: number;
  state: "connecting" | "succeeded" | "catalog" | "failed";
};

/** Only the newest observation may publish its outcome. */
export async function observeProviderRound<T>(
  target: Readonly<ProviderConfig>, credentialRevision: number, signal: AbortSignal,
  sequence: { current: number }, setObservation: (value: ProviderObservation | undefined) => void,
  operation: () => Promise<T>,
): Promise<T> {
  const observation = { id: target.id, endpoint: target.endpoint, model: target.model, credentialRevision };
  const current = ++sequence.current;
  setObservation({ ...observation, state: "connecting" });
  try {
    const result = await operation();
    if (!signal.aborted && sequence.current === current) setObservation({ ...observation, state: "succeeded" });
    return result;
  } catch (error) {
    if (sequence.current === current) setObservation(signal.aborted ? undefined : { ...observation, state: "failed" });
    throw error;
  }
}
