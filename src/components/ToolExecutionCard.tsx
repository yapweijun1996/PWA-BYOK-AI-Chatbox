import { ChevronDown, Code2 } from "lucide-react";
import { translate } from "../i18n";
import type { Locale } from "../i18n";
import type { ToolExecution } from "../javascript-tool";
import "../tool-execution.css";

const statusLabels = {
  success: "Completed",
  error: "Failed",
  timeout: "Timed out",
  cancelled: "Cancelled",
  limit: "Limit reached",
} as const;

export function ToolExecutionCard({
  execution,
  locale,
}: {
  execution: ToolExecution;
  locale: Locale;
}) {
  const t = (text: string) => translate(locale, text);
  const result = execution.result;
  const status = result
    ? t(statusLabels[result.status])
    : t("Running JavaScript");
  return (
    <details
      className="tool-execution"
      data-status={result?.status ?? "running"}
    >
      <summary>
        <Code2 size={16} aria-hidden="true" />
        <strong>{execution.name}</strong>
        <span role="status" aria-live="polite">
          {status}
        </span>
        {result && (
          <span className="tool-time">
            {new Intl.NumberFormat(locale).format(result.durationMs)} ms
          </span>
        )}
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="tool-execution-body">
        {execution.code && (
          <>
            <h4>{t("JavaScript source")}</h4>
            <pre tabIndex={0} aria-label={t("JavaScript source")}>
              <code>{execution.code}</code>
            </pre>
          </>
        )}
        {result?.console.length ? (
          <>
            <h4>{t("Console output")}</h4>
            <pre tabIndex={0} aria-label={t("Console output")}>
              {result.console.map(({ level, text }, index) => (
                <span key={index}>
                  <strong>{level}</strong> {text}
                  {index < result.console.length - 1 ? "\n" : ""}
                </span>
              ))}
            </pre>
          </>
        ) : null}
        {result?.error && (
          <p className="tool-error">{t(result.error.message)}</p>
        )}
        {result?.status === "success" && (
          <>
            <h4>{t("Execution result")}</h4>
            {result.value ? (
              <pre tabIndex={0} aria-label={t("Execution result")}>
                <code>{result.value.text}</code>
              </pre>
            ) : (
              <p className="muted">{t("No return value.")}</p>
            )}
          </>
        )}
        {result?.truncated && (
          <p className="muted">{t("Execution output was truncated.")}</p>
        )}
      </div>
    </details>
  );
}
