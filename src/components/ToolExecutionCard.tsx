import { ChevronDown, Code2 } from "lucide-react";
import { translate, translateNotice } from "../i18n";
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
const toolLabels: Record<string, string> = {
  time_tool: "Time",
  calculate: "Calculation",
  analyze_file: "File analysis",
  text_tool: "Text processing",
  memory_tool: "Local memory",
};

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
    : t(execution.name === "javascript.execute" ? "Running JavaScript" : "Running tool");
  return (
    <details
      className="tool-execution"
      data-status={result?.status ?? "running"}
    >
      <summary>
        <Code2 size={16} aria-hidden="true" />
        <strong>{t(toolLabels[execution.name] ?? execution.name)}</strong>
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
            <h4>{t(execution.name === "javascript.execute" ? "JavaScript source" : "Tool input")}</h4>
            <pre tabIndex={0} aria-label={t(execution.name === "javascript.execute" ? "JavaScript source" : "Tool input")}>
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
          <p className="tool-error">{translateNotice(locale, result.error.message)}</p>
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
