import { useEffect, useRef, useState } from "react";
import { translate, type Locale } from "../i18n";
import type { ConsoleEntry } from "../js-tool-runtime";

export function PreviewConsole({ entries, truncated, onClear, locale, expandOnError = false }: {
  entries: readonly ConsoleEntry[];
  truncated: boolean;
  onClear: () => void;
  locale: Locale;
  expandOnError?: boolean;
}) {
  const t = (text: string) => translate(locale, text);
  const details = useRef<HTMLDetailsElement>(null);
  const errors = entries.filter((entry) => entry.level === "error").length;
  const warnings = entries.filter((entry) => entry.level === "warn").length;
  const [copyNotice, setCopyNotice] = useState("");
  const previousErrors = useRef(0);
  useEffect(() => {
    if ((errors > previousErrors.current || expandOnError) && details.current) details.current.open = true;
    previousErrors.current = errors;
  }, [errors, expandOnError]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entries.map(({ level, text }) => `[${level}] ${text}`).join("\n"));
      setCopyNotice(t("Copied."));
    } catch { setCopyNotice(t("Copy unavailable.")); }
  };
  return <details className="rich-preview-console" ref={details}>
    <summary><strong>{t("Console")}</strong><span className="rich-preview-console-count">{entries.length}</span>{errors > 0 && <span className="rich-preview-console-badge" data-level="error">{t("Errors")}: {errors}</span>}{warnings > 0 && <span className="rich-preview-console-badge" data-level="warn">{t("Warnings")}: {warnings}</span>}</summary>
    <div className="rich-preview-console-body">
      <div className="rich-preview-console-actions"><span role="status" aria-live="polite">{copyNotice}</span><button type="button" className="rich-code-copy" disabled={!entries.length} onClick={() => void copy()}>{t("Copy console")}</button><button type="button" className="rich-code-copy" disabled={!entries.length} onClick={() => { setCopyNotice(""); onClear(); }}>{t("Clear console")}</button></div>
      {truncated && <p className="rich-preview-console-truncated">{t("Some console output was omitted because the limit was reached.")}</p>}
      {entries.length ? <ol tabIndex={0} aria-label={t("Console output")}>{entries.map((entry, index) => <li key={index} data-level={entry.level}><strong>{entry.level}</strong><span>{entry.text}</span></li>)}</ol> : <p className="rich-preview-console-empty">{t("No console output yet.")}</p>}
    </div>
  </details>;
}
