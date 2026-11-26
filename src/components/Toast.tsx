import { CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { translate, translateNotice } from "../i18n";
import type { Locale } from "../i18n";

// Only clearly completed, nonessential confirmations disappear automatically.
// Errors, progress, and messages requiring action stay until dismissed or replaced.
const transientConfirmations = new Set([
  "Luma Chat is up to date.",
  "Copied.",
  "Conversation archived.",
  "Conversation restored.",
  "Local data cleared.",
]);
const confirmationDuration = 6000;

export function Toast({ locale, message, revision, onDismiss }: {
  locale: Locale;
  message: string;
  revision: number;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const toastRef = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const transient = transientConfirmations.has(message);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!message) { setHovered(false); return; }
    const update = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = toastRef.current?.getBoundingClientRect();
      setHovered(Boolean(rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
    };
    window.addEventListener("pointermove", update);
    return () => window.removeEventListener("pointermove", update);
  }, [message, revision]);

  useEffect(() => {
    if (!transient || hovered || focused || hidden) return;
    const timer = window.setTimeout(() => dismiss.current(), confirmationDuration);
    return () => window.clearTimeout(timer);
  }, [message, revision, transient, hovered, focused, hidden]);

  const StatusIcon = transient ? CheckCircle2 : Info;
  return (
    <div
      ref={toastRef}
      className="toast"
      data-visible={Boolean(message)}
      data-kind={transient ? "success" : "info"}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div role="status" aria-live="polite" aria-atomic="true">
        {message && <StatusIcon className="toast-status-icon" size={18} aria-hidden="true" />}
        <span>{translateNotice(locale, message)}</span>
      </div>
      {message && (
        <button
          className="icon"
          type="button"
          aria-label={translate(locale, "Dismiss message")}
          onClick={onDismiss}
        >
          <X size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
