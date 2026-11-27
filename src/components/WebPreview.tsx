import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { translate, translateNotice, type Locale } from "../i18n";
import { executeJavaScript, type ExecutionResult } from "../js-tool-runtime";
import { previewDocument } from "../web-preview";
import { PreviewConsole } from "./PreviewConsole";
import type { ConsoleEntry } from "../js-tool-runtime";
import { Maximize2, Minimize2 } from "lucide-react";

export function WebPreview({ source, language, locale }: { source: string; language: string; locale: Locale }) {
  const [size, setSize] = useState("responsive");
  const [fullscreen, setFullscreen] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [result, setResult] = useState<ExecutionResult>();
  const [running, setRunning] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const received = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const execution = useRef<AbortController | null>(null);
  const javascript = language === "javascript" || language === "js";
  const statusLabel = result && ({ success: "Execution succeeded", error: "Execution failed", timeout: "Execution timed out", cancelled: "Execution cancelled", limit: "Execution limit reached" } as const)[result.status];
  const documentSource = useMemo(() => javascript ? "" : previewDocument(language, source, interactive), [javascript, language, source, interactive]);
  useEffect(() => {
    setRunning(false); setResult(undefined); setEntries([]); setTruncated(false);
    return () => { execution.current?.abort(); execution.current = null; };
  }, [source, language]);
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!interactive || event.source !== frame.current?.contentWindow || !event.data || event.data.__lumaPreview !== 1) return;
      if (event.data.truncated === true) { setTruncated(true); return; }
      const { level, text } = event.data;
      if (!["log", "info", "warn", "error"].includes(level) || typeof text !== "string" || received.current >= 300) return;
      received.current++;
      setEntries((current) => [...current.slice(-99), { level, text: text.slice(0, 2000) }]);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [interactive]);
  useLayoutEffect(() => { if (fullscreen && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [fullscreen]);
  useLayoutEffect(() => { if (!fullscreen && restoreFocus.current) { fullscreenButton.current?.focus(); restoreFocus.current = false; } }, [fullscreen]);
  const resetConsole = () => { setEntries([]); setTruncated(false); };
  const clearConsole = () => { setEntries([]); if (!interactive) setTruncated(false); };
  const resize = (next: boolean) => { if (!next) restoreFocus.current = true; if (!javascript) { received.current = 0; resetConsole(); } setFullscreen(next); };
  const run = async () => {
    if (execution.current) return;
    const controller = new AbortController();
    execution.current = controller; setResult(undefined); resetConsole(); setRunning(true);
    const next = await executeJavaScript({ code: source }, controller.signal);
    if (execution.current !== controller) return;
    execution.current = null; setRunning(false); setResult(next); setEntries([...next.console]); setTruncated(next.truncated);
  };
  const advice = result?.error && ({ timeout: "Reduce the calculation size and try again.", memory: "Reduce the data size and try again.", runtime: "Reload the app and try again.", input: "Provide valid input within the tool limits.", javascript: "Check the JavaScript code and try again.", unsupported: "Check whether this operation is supported." } as Record<string, string>)[result.error.code];
  const panel = <section className="rich-code-preview" aria-label={translate(locale, "Code preview")}>
    <div className="rich-preview-toolbar">
      <div className="rich-preview-title"><strong>{translate(locale, "Code preview")}</strong><span>{translate(locale, javascript ? "Offline JavaScript" : interactive ? "Interactive" : "Static")}</span></div>
      <div className="rich-preview-controls">
      {!javascript && <label>{translate(locale, "Preview size")}
        <select value={size} onChange={(event) => setSize(event.target.value)}>
          <option value="responsive">{translate(locale, "Responsive")}</option>
          <option value="mobile">{translate(locale, "Mobile (375 px)")}</option>
          <option value="tablet">{translate(locale, "Tablet (768 px)")}</option>
          <option value="desktop">{translate(locale, "Desktop (1280 px)")}</option>
        </select>
      </label>}
      <button ref={fullscreenButton} autoFocus={fullscreen} type="button" className="rich-code-copy" onClick={() => fullscreen ? dialog.current?.close() : resize(true)}>{fullscreen ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}{translate(locale, fullscreen ? "Exit full screen" : "Full screen")}</button>
      </div>
    </div>
    {javascript ? <>
      <div className="rich-preview-notice">
      <p className="rich-code-preview-note">{translate(locale, "JavaScript runs offline with a time and memory limit. Browser APIs and timers are unavailable.")}</p>
      <button type="button" className="rich-code-copy" onClick={() => running ? execution.current?.abort() : void run()}>{translate(locale, running ? "Stop execution" : "Run offline")}</button>
      </div>
      {running && <p role="status" className="rich-preview-running">{translate(locale, "Running JavaScript")}</p>}
      {result && <div role="status" className="rich-preview-result" data-status={result.status}><strong>{translate(locale, "Execution status")}: {statusLabel && translate(locale, statusLabel)}</strong>{result.error && <p>{translateNotice(locale, result.error.message)}</p>}{advice && <p>{translate(locale, advice)}</p>}{result.value && <><strong>{translate(locale, "Execution result")}</strong><pre tabIndex={0}>{result.value.text}</pre></>}</div>}
      {result && <PreviewConsole entries={entries} truncated={truncated} onClear={clearConsole} locale={locale} expandOnError={result.status === "error"} />}
    </> : <>
      <div className="rich-preview-notice">
      <div>
      <p className="rich-code-preview-note">{translate(locale, "Static preview disables scripts and removes external links. Browser resource policies still apply.")}</p>
      <p className="rich-code-preview-note">{translate(locale, "Interactive preview can navigate to external sites and may not stop if scripts hang. Only run trusted code.")}</p>
      {interactive && <p className="rich-code-preview-note">{translate(locale, "Full screen restarts the preview.")}</p>}
      </div>
      <button type="button" className="rich-code-copy" aria-pressed={interactive} onClick={() => { received.current = 0; resetConsole(); setInteractive((value) => !value); }}>{translate(locale, interactive ? "Stop interactive preview" : "Enable interactive preview")}</button>
      </div>
      <div className="rich-preview-viewport"><iframe ref={frame} data-size={size} title={translate(locale, "Code preview")} sandbox={interactive ? "allow-scripts" : ""} referrerPolicy="no-referrer" srcDoc={documentSource} /></div>
      {interactive && <PreviewConsole entries={entries} truncated={truncated} onClear={clearConsole} locale={locale} />}
    </>}
  </section>;
  return fullscreen ? <dialog className="rich-preview-dialog" ref={dialog} aria-label={translate(locale, "Code preview")} onClose={() => resize(false)}>{panel}</dialog> : panel;
}
