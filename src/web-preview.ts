/** Each preview is an isolated, opaque-origin iframe. External subresources are restricted by CSP. */
export const previewLanguages = new Set(["html", "svg", "css", "javascript", "js"]);
const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const prefix = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1">`;
const bridge = `<script>
  (() => {
    let count = 0;
    const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value); } catch { return String(value); } };
    const send = (level, text) => { if (count++ < 100) parent.postMessage({ __lumaPreview: 1, level, text: String(text).slice(0, 2000) }, '*'); };
    for (const level of ['log', 'info', 'warn', 'error']) {
      const original = console[level].bind(console);
      console[level] = (...args) => { const text = args.map(format).join(' '); send(level, text); const output = document.getElementById('output'); if (output && output.dataset.previewConsole === 'true') output.textContent += text + '\\n'; original(...args); };
    }
    window.addEventListener('error', event => send('error', event.message || 'Resource failed to load.'));
    window.addEventListener('unhandledrejection', event => send('error', format(event.reason)));
    document.addEventListener('securitypolicyviolation', event => send('warn', 'Blocked by preview policy: ' + event.violatedDirective));
  })();
</script>`;

/** Builds an independent document from a single fenced code block. */
export function previewDocument(language: string, source: string): string {
  if (language === "css") return `${prefix}${bridge}<style>${source}</style><main><h1>Heading</h1><p>Preview text and <a href="#">a link</a>.</p><button type="button">Button</button><input placeholder="Input"></main>`;
  if (language === "javascript" || language === "js") {
    const encoded = JSON.stringify(source).replace(/</g, "\\u003c");
    return `${prefix}${bridge}<pre id="output" data-preview-console="true"></pre><script>const script = document.createElement('script'); script.textContent = ${encoded}; document.body.appendChild(script);</script>`;
  }
  return prefix + bridge + source;
}
