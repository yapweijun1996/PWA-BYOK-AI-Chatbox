import { useId, useLayoutEffect, useRef } from "react";
import { interpolate, translate, type Locale } from "../i18n";
import { labels, type ProviderId } from "../types";
import type { HistoryChoice } from "../history-sharing";

export function HistorySharingDialog({
  locale,
  provider,
  onChoose,
}: {
  locale: Locale;
  provider: ProviderId;
  onChoose: (choice: HistoryChoice) => void;
}) {
  const t = (text: string) => translate(locale, text);
  const title = useId();
  const description = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      className="workspace-dialog"
      ref={dialog}
      aria-labelledby={title}
      aria-describedby={description}
      onCancel={(event) => {
        event.preventDefault();
        onChoose("cancel");
      }}
    >
      <div className="workspace-panel">
        <div className="workspace-dialog-heading">
          <h2 id={title}>{t("Share chat history?")}</h2>
        </div>
        <p id={description}>
          {interpolate(
            t(
              "Sending to {name} will include earlier messages and their attachments.",
            ),
            labels[provider],
          )}
        </p>
        <p>{t("Only the selected branch and its attachments are sent.")}</p>
        <p>
          {t(
            "Starting an empty chat sends nothing. Your draft and files stay in the original chat.",
          )}
        </p>
        <div className="button-row">
          <button
            className="secondary"
            type="button"
            onClick={() => onChoose("cancel")}
          >
            {t("Cancel")}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => onChoose("fresh")}
          >
            {t("Start an empty chat")}
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => onChoose("share")}
          >
            {t("Send with history")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
