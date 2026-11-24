import { useId, useRef, useState } from "react";
import { checkedLmStudioAddress } from "../credential-destination";
import { translate, type Locale } from "../i18n";

export function LmStudioAddressEditor({
  endpoint,
  locale,
  onApply,
}: {
  endpoint: string;
  locale: Locale;
  onApply: (address: string) => Promise<boolean>;
}) {
  const t = (text: string) => translate(locale, text);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const approved = checkedLmStudioAddress(endpoint);
  const close = () => {
    dialog.current?.close();
    setDraft("");
    setError("");
  };
  const apply = async () => {
    const address = checkedLmStudioAddress(draft);
    if (!address) {
      setError(
        "Enter a valid HTTP(S) endpoint without credentials, query, or fragment.",
      );
      return;
    }
    if (address === approved) return close();
    setSaving(true);
    try {
      if (await onApply(address)) close();
      else setError("Could not save the server address. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <label className="field">
        {t("Current server address")}
        <input readOnly value={approved ?? t("Invalid server address")} />
      </label>
      <button
        className="secondary"
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(approved ?? "");
          dialog.current?.showModal();
        }}
      >
        {t("Edit server address")}
      </button>
      <dialog
        className="workspace-dialog"
        ref={dialog}
        aria-labelledby={title}
        onCancel={(event) => {
          event.preventDefault();
          if (!saving) close();
        }}
      >
        <form
          className="workspace-panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) void apply();
          }}
        >
          <div className="workspace-dialog-heading">
            <h2 id={title}>{t("Edit server address")}</h2>
          </div>
          <label className="field">
            {t("Server base URL")}
            <input
              value={draft}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
              placeholder="http://localhost:1234/v1"
            />
          </label>
          {error && (
            <p className="hint" id={errorId} role="alert">
              {t(error)}
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="primary" disabled={saving}>
              {t("Apply address")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={close}
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
