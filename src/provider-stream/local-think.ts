// Some local models include their reasoning in leading <think> tags rather than
// using the structured reasoning field. Tags can be split across SSE chunks.
export function localThinkRouter(
  onText: (text: string) => void,
  onReasoning: (text: string) => void,
) {
  let mode: "start" | "thinking" | "answer" = "start";
  let pending = "";
  const open = "<think>";
  const close = "</think>";
  const push = (text: string) => {
    if (mode === "answer") {
      onText(text);
      return;
    }
    pending += text;
    if (mode === "start") {
      const leading = pending.trimStart();
      if (
        leading.length < open.length &&
        open.startsWith(leading) &&
        pending.length <= 128
      )
        return;
      if (!leading.startsWith(open)) {
        mode = "answer";
        onText(pending);
        pending = "";
        return;
      }
      pending = leading.slice(open.length);
      mode = "thinking";
    }
    const end = pending.indexOf(close);
    if (end !== -1) {
      if (end) onReasoning(pending.slice(0, end));
      const answer = pending.slice(end + close.length);
      pending = "";
      mode = "answer";
      if (answer) onText(answer);
      return;
    }
    let keep = Math.min(pending.length, close.length - 1);
    while (keep > 0 && !close.startsWith(pending.slice(-keep))) keep--;
    const ready = pending.slice(0, pending.length - keep);
    pending = pending.slice(pending.length - keep);
    if (ready) onReasoning(ready);
  };
  return {
    push,
    flush: () => {
      if (pending) {
        if (mode === "thinking") onReasoning(pending);
        else onText(pending);
        pending = "";
      }
    },
  };
}
