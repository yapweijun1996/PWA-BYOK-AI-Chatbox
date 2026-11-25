import { useId, useLayoutEffect, useRef, useState } from "react";
import { interpolate, translate, type Locale } from "../i18n";
import { labels, type ProviderConfig } from "../types";
import type { RequestSnapshot } from "../request-config";

export function MessageActionDialog({
  locale,
  kind,
  current,
  original,
  branchCount,
  onClose,
  onConfirm,
}: {
  locale: Locale;
  kind: "retry" | "edit" | "delete";
  current: Readonly<ProviderConfig>;
  original?: RequestSnapshot;
  branchCount?: number;
  onClose: () => void;
  onConfirm: (original?: RequestSnapshot) => void;
}) {
  const t = (text: string) => translate(locale, text);
  const title = useId();
  const description = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<"current" | "original">("current");
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog message-action-dialog"
      aria-labelledby={title}
      aria-describedby={description}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="workspace-panel">
        <div className="workspace-dialog-heading">
          <h2 id={title}>
            {t(
              kind === "retry"
                ? "Retry reply?"
                : kind === "delete"
                  ? "Delete branch?"
                  : "Replace current draft?",
            )}
          </h2>
        </div>
        {kind === "retry" ? (
          <>
            <p id={description}>
              {t(
                "A new request may incur charges. Earlier replies stay in this chat.",
              )}
            </p>
            <fieldset className="retry-choices">
              <legend>{t("Choose a model")}</legend>
              <label>
                <input
                  type="radio"
                  name="retry-model"
                  checked={choice === "current"}
                  onChange={() => setChoice("current")}
                />
                <span>
                  <strong>{t("Current model")}</strong>
                  <small>
                    {labels[current.id]} · {current.model || t("Choose model")}
                  </small>
                </span>
              </label>
              {original && (
                <label>
                  <input
                    type="radio"
                    name="retry-model"
                    checked={choice === "original"}
                    onChange={() => setChoice("original")}
                  />
                  <span>
                    <strong>{t("Original model")}</strong>
                    <small>
                      {labels[original.provider]} · {original.model}
                    </small>
                  </span>
                </label>
              )}
            </fieldset>
            {original && (
              <p className="hint">
                {t(
                  "The original model uses its current provider connection and key.",
                )}
              </p>
            )}
          </>
        ) : kind === "delete" ? (
          <p id={description}>
            {branchCount === 1
              ? t("Delete this message? This cannot be undone.")
              : interpolate(
                  t(
                    "Delete this branch and its {name} messages? This cannot be undone.",
                  ),
                  String(branchCount ?? 0),
                )}
          </p>
        ) : (
          <p id={description}>
            {t(
              "Your current draft and attachments will be kept so you can restore them by cancelling the edit. The original message remains unchanged.",
            )}
          </p>
        )}
        <div className="button-row">
          <button
            className="secondary"
            type="button"
            autoFocus
            onClick={onClose}
          >
            {t("Cancel")}
          </button>
          <button
            className="primary"
            type="button"
            onClick={() =>
              onConfirm(choice === "original" ? original : undefined)
            }
          >
            {t(
              kind === "retry"
                ? "Retry reply"
                : kind === "delete"
                  ? "Delete branch"
                  : "Edit message",
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}
