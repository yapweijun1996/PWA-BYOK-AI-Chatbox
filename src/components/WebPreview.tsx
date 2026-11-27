import { useLayoutEffect, useRef, useState } from "react";
import { translate, type Locale } from "../i18n";

type Entry = { level: "log" | "info" | "warn" | "error"; text: string };
export function WebPreview({ source, locale }: { source: string; locale: Locale }) {
  const [size, setSize] = useState("responsive");
  const [fullscreen, setFullscreen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const received = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || event.data.__lumaPreview !== 1) return;
      const { level, text } = event.data;
      if (!["log", "info", "warn", "error"].includes(level) || typeof text !== "string" || received.current >= 300) return;
      received.current++;
      setEntries((current) => [...current.slice(-99), { level, text: text.slice(0, 2000) }]);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useLayoutEffect(() => { if (fullscreen && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [fullscreen]);
  const resize = (next: boolean) => { received.current = 0; setEntries([]); setFullscreen(next); };
  const panel = <section className="rich-code-preview" aria-label={translate(locale, "Code preview")}>
    <div className="rich-preview-toolbar">
      <label>{translate(locale, "Preview size")}
        <select value={size} onChange={(event) => setSize(event.target.value)}>
          <option value="responsive">{translate(locale, "Responsive")}</option>
          <option value="mobile">{translate(locale, "Mobile (375 px)")}</option>
          <option value="tablet">{translate(locale, "Tablet (768 px)")}</option>
          <option value="desktop">{translate(locale, "Desktop (1280 px)")}</option>
        </select>
      </label>
      <button type="button" className="rich-code-copy" onClick={() => fullscreen ? dialog.current?.close() : resize(true)}>{translate(locale, fullscreen ? "Exit full screen" : "Full screen")}</button>
    </div>
    <div className="rich-code-preview-note">{translate(locale, "Preview runs in isolation. External resources may be blocked.")} {translate(locale, "Full screen restarts the preview.")}</div>
    <div className="rich-preview-viewport"><iframe ref={frame} data-size={size} title={translate(locale, "Code preview")} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source} /></div>
    <details className="rich-preview-console" open={entries.some((entry) => entry.level === "error")}>
      <summary>{translate(locale, "Console")} ({entries.length})</summary>
      {entries.length ? <ol>{entries.map((entry, index) => <li key={index} data-level={entry.level}><strong>{entry.level}</strong> {entry.text}</li>)}</ol> : <p>{translate(locale, "No console output yet.")}</p>}
    </details>
  </section>;
  return fullscreen ? <dialog className="rich-preview-dialog" ref={dialog} aria-label={translate(locale, "Code preview")} onClose={() => resize(false)}>{panel}</dialog> : panel;
}
