import { X } from "lucide-react";
import { translate, translateNotice } from "../i18n";
import type { Locale } from "../i18n";

export function Toast({
  locale,
  message,
  onDismiss,
}: {
  locale: Locale;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="toast" data-visible={Boolean(message)}>
      <div role="status">
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
