import { useState } from "react";
import { CheckCircle2, ChevronDown, Code2, Copy } from "lucide-react";
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
  const [copyNotice, setCopyNotice] = useState<{ kind: "code" | "result"; message: string } | null>(null);
  const t = (text: string) => translate(locale, text);
  const result = execution.result;
  const status = result
    ? t(statusLabels[result.status])
    : t(execution.name === "javascript.execute" ? (execution.stage === "starting" ? "Starting JavaScript" : "Running JavaScript") : "Running tool");
  const copy = async (kind: "code" | "result", text: string) => {
    try { await navigator.clipboard.writeText(text); setCopyNotice({ kind, message: t("Copied.") }); }
    catch { setCopyNotice({ kind, message: t("Copy unavailable.") }); }
  };
  const advice = result?.error && ({
    timeout: "Reduce the calculation size and try again.",
    memory: "Reduce the data size and try again.",
    runtime: "Reload the app and try again.",
    input: "Provide valid input within the tool limits.",
    javascript: "Check the JavaScript code and try again.",
    unsupported: "Check whether this operation is supported.",
  } as Record<string, string>)[result.error.code];
  return (
    <details
      className="tool-execution"
      data-status={result?.status ?? "running"}
    >
      <summary>
        <Code2 size={16} aria-hidden="true" />
        <strong>{t(toolLabels[execution.name] ?? execution.name)}</strong>
        <span className="tool-status" role="status" aria-live="polite">
          {result?.status === "success" && <CheckCircle2 size={13} aria-hidden="true" />}
          {status}
        </span>
        {result && (
          <span className="tool-time">
            {new Intl.NumberFormat(locale).format(result.totalMs ?? result.durationMs)} ms
          </span>
        )}
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="tool-execution-body">
        {execution.code && (
          <>
            <div className="tool-heading"><h4>{t(execution.name === "javascript.execute" ? "JavaScript source" : "Tool input")}</h4><span className="tool-copy"><span role="status" aria-live="polite">{copyNotice?.kind === "code" ? copyNotice.message : ""}</span><button type="button" onClick={() => void copy("code", execution.code)} aria-label={t("Copy code")} title={t("Copy code")}><Copy size={14} aria-hidden="true" /></button></span></div>
            <pre tabIndex={0} aria-label={t(execution.name === "javascript.execute" ? "JavaScript source" : "Tool input")}>
              <code>{execution.code}</code>
            </pre>
          </>
        )}
        {result && (result.startupMs !== undefined || result.totalMs !== undefined) && <p className="tool-timings">{result.startupMs !== undefined && <span>{t("Startup")}: {result.startupMs} ms · </span>}{result.executionMs !== undefined && <span>{t("Execution")}: {result.executionMs} ms · </span>}{result.totalMs !== undefined && <span>{t("Total")}: {result.totalMs} ms</span>}</p>}
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
          <div><p className="tool-error">{translateNotice(locale, result.error.message)}</p>{advice && <p className="muted">{t(advice)}</p>}</div>
        )}
        {result?.status === "success" && (
          <>
            <div className="tool-heading"><h4>{t("Execution result")}</h4>{result.value && <span className="tool-copy"><span role="status" aria-live="polite">{copyNotice?.kind === "result" ? copyNotice.message : ""}</span><button type="button" onClick={() => void copy("result", result.value!.text)} aria-label={t("Copy result")} title={t("Copy result")}><Copy size={14} aria-hidden="true" /></button></span>}</div>
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
