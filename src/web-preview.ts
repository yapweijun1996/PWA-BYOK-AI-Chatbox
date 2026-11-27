/** Each preview is an isolated, opaque-origin iframe. External subresources are blocked by CSP. */
export const previewLanguages = new Set(["html", "svg", "css", "javascript", "js"]);
const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const prefix = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1">`;

/** Builds an independent document from a single fenced code block. */
export function previewDocument(language: string, source: string): string {
  if (language === "css") return `${prefix}<style>${source}</style><main><h1>Heading</h1><p>Preview text and <a href="#">a link</a>.</p><button type="button">Button</button><input placeholder="Input"></main>`;
  if (language === "javascript" || language === "js") {
    const encoded = JSON.stringify(source).replace(/</g, "\\u003c");
    return `${prefix}<pre id="output"></pre><script>
      const output = document.getElementById('output');
      const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value); } catch { return String(value); } };
      for (const level of ['log', 'info', 'warn', 'error']) console[level] = (...args) => { output.textContent += args.map(format).join(' ') + '\\n'; };
      window.addEventListener('error', event => { output.textContent += event.message + '\\n'; });
      const script = document.createElement('script'); script.textContent = ${encoded}; document.body.appendChild(script);
    </script>`;
  }
  return prefix + source;
}
