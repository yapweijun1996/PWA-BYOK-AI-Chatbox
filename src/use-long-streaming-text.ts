import { useEffect, useRef, useState } from "react";

// Coalesce display updates only after the response is large enough for repeated
// full-document Markdown parsing to become expensive. Persistence is unaffected.
export const longStreamingThreshold = 8_192;
export const longStreamingIntervalMs = 120;

export function useLongStreamingText(text: string, streaming: boolean): string {
  const [snapshot, setSnapshot] = useState(text);
  const state = useRef({ active: false, text, at: 0 });
  useEffect(() => {
    const current = state.current;
    if (!streaming || text.length < longStreamingThreshold) {
      current.active = false;
      return;
    }
    const commit = () => {
      current.active = true;
      current.text = text;
      current.at = performance.now();
      setSnapshot(text);
    };
    if (!current.active || !text.startsWith(current.text)) {
      commit();
      return;
    }
    const delay = Math.max(
      0,
      longStreamingIntervalMs - (performance.now() - current.at),
    );
    if (!delay) {
      commit();
      return;
    }
    const timer = window.setTimeout(commit, delay);
    return () => window.clearTimeout(timer);
  }, [text, streaming]);
  // Completed, interrupted and replaced text must appear immediately.
  return streaming &&
    text.length >= longStreamingThreshold &&
    state.current.active &&
    text.startsWith(snapshot)
    ? snapshot
    : text;
}
