import type { ExecutionResult, ConsoleEntry } from "./js-tool-runtime";

/** Export the current offline execution report without executing any source. */
export function javascriptPreviewReport(result: ExecutionResult, entries: readonly ConsoleEntry[], truncated: boolean): string {
  const lines = [`Status: ${result.status}`];
  if (result.error) lines.push(`Error: ${result.error.message}`);
  if (result.value) lines.push("", "Result:", result.value.text);
  lines.push("", "Console:");
  lines.push(...(entries.length ? entries.map(({ level, text }) => `[${level}] ${text}`) : ["(empty)"]));
  if (truncated) lines.push("(Some output was omitted.)");
  return lines.join("\n") + "\n";
}

export function downloadPreview(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
