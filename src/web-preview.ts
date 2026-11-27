/** Each preview is an isolated, opaque-origin iframe. External subresources are restricted by CSP. */
export const previewLanguages = new Set(["html", "svg", "css", "javascript", "js"]);
const interactivePolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const staticPolicy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const prefix = (interactive: boolean) => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${interactive ? interactivePolicy : staticPolicy}"><meta name="viewport" content="width=device-width, initial-scale=1">`;
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

/** Parse in an inert template before insertion into a script-disabled frame. */
export function sanitizeStaticMarkup(source: string): string {
  const template = document.createElement("template");
  template.innerHTML = source;
  template.content.querySelectorAll("script,iframe,frame,object,embed,link,meta,base,form,animate,set,animateMotion,animateTransform").forEach((element) => element.remove());
  for (const element of template.content.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || name === "formaction" || name === "ping" || ((name === "href" || name === "xlink:href") && !value.startsWith("#"))) element.removeAttribute(attribute.name);
    }
  }
  return template.innerHTML;
}

/** Interactive previews are explicitly opt-in and retain browser limitations. */
export function previewDocument(language: string, source: string, interactive = false): string {
  const head = prefix(interactive);
  const body = language === "css" ? `<style>${source}</style><main><h1>Heading</h1><p>Preview text and <a href="#">a link</a>.</p><button type="button">Button</button><input placeholder="Input"></main>` : source;
  return head + (interactive ? bridge + body : sanitizeStaticMarkup(body));
}
