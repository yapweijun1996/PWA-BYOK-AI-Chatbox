# Luma Chat

Luma Chat is a local-first, installable BYOK AI chat application. It supports direct browser connections to Gemini, OpenAI, OpenRouter, and LM Studio. The design references in `DESIGN/` describe the intended visual direction; this is an independent implementation.

The UI supports English and Simplified Chinese. Use **Settings → Appearance** to choose a language and a light, dark, or system theme. **Settings** also contains AI providers and Local data.

For the source review, prioritized bugs, implementation tasks, and release criteria, see the [engineering roadmap](ROADMAP.md). It distinguishes committed functionality from work in progress; it is not a release announcement.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Open the address printed by Vite. To build the installable production version, run `npm run build` followed by `npm run preview`. PWA caching is enabled in the production build. A deployed PWA requires HTTPS; localhost is suitable for local development.

## Startup and recovery

The static HTML splash paints without waiting for the app bundle or stylesheet. An early script applies the saved theme hint (or the system preference); the splash and app share the same palette and system font stack. IndexedDB remains authoritative. On the first launch after upgrading from an older build, an explicit theme that was stored only in IndexedDB is applied under the splash and mirrored for subsequent first paints.

Startup opens IndexedDB and waits for any outstanding schema creation or upgrade to finish. A single read restores settings, the last selected conversation, its draft and attachments, and the selected provider/model. Older data without a saved selection opens the most recent conversation. The app remains hidden and non-interactive until styles load, React commits, and the initial layout, model and composer draft pass verification. The splash then fades out, or disappears immediately with reduced motion. Service worker registration and update monitoring run after readiness, and provider catalogs are not fetched on startup.

If startup takes more than 12 seconds or fails, the splash offers retry without clearing local data. Storage retries run in place; unavailable app files or a failed UI check offer a reload. Offline startup requires a previously cached production build. An installed PWA's native launch screen, if shown before HTML loads, is controlled by the browser/OS.

Startup metrics stay local in the browser Performance timeline. `luma:startup:*` marks record the early shell and each attempt, with measured database open, restore, stylesheet wait, mount, verification and splash fade durations. `performance.getEntriesByName("luma:startup:interactive")` gives navigation-to-interaction time; browser Paint Timing separately reports first contentful paint where supported.

## Workspace sidebar

Use **New chat** or **Search conversations** in the sidebar, or press `Ctrl/⌘ + K` to search titles, message text, and project names locally. Conversation action buttons can rename, pin, archive, move, or delete chats. Archived conversations are hidden from the main groups and can be opened or restored from **Archived**. A pinned chat appears only under **Pinned**, even when it belongs to a project. Unpinning returns it to its project or to Recent. Projects can be created and renamed; move all assigned conversations out (including archived conversations) before deleting an empty project.

On desktop, drag the sidebar's right edge, or focus the separator and use Left/Right (Home/End for limits). Width and collapsed state are restored before revealing the app. The mobile drawer opens over the chat rather than resizing it. Projects and conversation organization live in the existing IndexedDB stores and are included in version-1 backups; older backups still import. API keys are not exported.

## Configure a provider

Open Settings, choose a provider, enter a model ID, and supply your own key where required. The model list does not prove a key or chat request is authorized; some providers expose a public catalog. The app connects directly from the browser; it has no proxy or backend. A provider can reject browser requests because of CORS or other restrictions. OpenRouter uses its own key and model IDs, such as `thinkingmachines/inkling-2-mini`; listing the model does not guarantee access or available credits.

Use **Choose model** in the composer to search configured models and catalogs you load on demand. The toolbar uses short names, while the selector shows full model IDs. The composer offers reasoning as a supported on/off option rather than model-specific effort levels. The development working tree also includes an experimental, per-reply JavaScript tool; do not assume it is available in a deployed build. When enabled, code runs locally and its result is sent to the selected provider for a follow-up request, which may incur charges. Changing the model clears unverified capabilities instead of carrying them over from the previous model.

For LM Studio, start its server and enable CORS. The default base URL is `http://localhost:1234/v1`. Authentication is optional when disabled in LM Studio; use a token when it is enabled. On a phone, `localhost` means the phone: use the computer's accessible LAN address and configure LM Studio to serve on the local network. Browser local-network permission, HTTPS mixed-content rules, CORS, and firewall settings vary. Enable authentication when exposing the server; plain HTTP can expose prompts and tokens to the network. A trusted HTTPS connection is preferable. Browser and device support must be verified for the actual environment.

The app keeps session keys in memory until lock, reload, or close. Opt-in encrypted storage uses a password-derived AES-GCM key. Losing the password prevents recovery. Encryption protects stored ciphertext from some device-storage exposure; it does not protect a key while the app is unlocked from malicious page scripts or a compromised device. API keys are excluded from backups and are never intentionally logged. Cloud providers receive submitted messages and attachments. Direct browser key use is a deliberate user-selected tradeoff and does not meet OpenAI's recommendation to keep API keys on a server.

When a provider supplies reasoning text in its stream, Luma Chat displays it separately from the final answer and saves it with the conversation and backups. LM Studio supports structured reasoning fields and leading `<think>` tags; OpenRouter supports its text and summary reasoning details. For OpenRouter or Gemini, request reasoning in provider settings only for a supported model; content is not guaranteed and may affect cost. OpenAI Chat Completions does not expose raw reasoning, so it may show no reasoning text. Reasoning displayed in the app is not sent back in later chat requests.

## Rich messages

Chat and reasoning bubbles render CommonMark and GitHub Flavored Markdown, including checklists, tables and links. Use `$…$` for inline math and `$$` on separate lines for display math. Code fences show a language label and can be copied independently of the whole reply; supported languages are highlighted, while unknown languages remain plain text. Long code, tables, and equations scroll within the bubble.

During streaming, completed blocks stay rendered and the still-changing trailing block appears as literal text. The final pass renders the complete Markdown; IndexedDB and backups keep the original source. New content follows the conversation bottom only while you are there. Raw HTML is ignored, unsafe links are disabled, and images are fetched only if you explicitly load them. External images still require their host to be reachable. KaTeX, syntax grammars, CSS and WOFF2 fonts are served locally and precached with the production PWA.

## Workspace Inspector and configuration ownership

Open **Workspace Inspector** from the top bar. Its read-only Runtime, Context, Configuration, Telemetry, Storage, and PWA tabs show value provenance, the active request, a selectable historical reply, and actual database and service-worker status. The JSON export is a diagnostic summary, not a backup: it omits credentials, headers, endpoint addresses, model identifiers, conversation IDs, raw messages, reasoning, drafts, and attachments. Connection targets are classified by transport and loopback/network instead of exporting the URL. Browser storage quota and usage are origin-wide estimates.

IndexedDB is the persistent repository. Startup restores a single workspace session projection, and UI controls call shared actions against it. Uncommitted drafts and streamed checkpoints stay in the session until written; the inspector distinguishes in-memory state from persisted records. Credential inputs are transient, session keys are separate from preferences, and encrypted vault storage is never inspected or exported by the inspector. Theme hints are only for first paint; browser and service-worker status come from their platform owners.

Model configuration resolves **request override → conversation override → global profile → app default**. In AI providers, use **Use this model for the current chat** to make model and capability changes in the composer conversation-specific, or **Use global model settings** to inherit again. Transport endpoints and credentials still belong to the provider, not the conversation. **Retry with original model** reuses the previous request’s model/capability selection with the provider’s current endpoint and credential. Each new reply stores the resolved request facts separately from Markdown and telemetry; older replies are not backfilled. Global values identical to defaults without a model profile are presented as default values.

## Response telemetry

Each assistant reply has a compact telemetry footer and an expandable **Response inspector**. Client timing begins when the app starts the provider request, after saving the message: TTFT measures arrival of the first generated text or reasoning delta, TTFV the first nonblank answer text, and duration through completion or interruption. LM Studio and OpenAI request streaming usage, including a terminal event with usage but no choices. For LM Studio, TPS prefers the server’s `timings.predicted_n ÷ timings.predicted_ms × 1000`; it does not mix that duration with standard usage counts. Without server generation timings, a browser estimate uses reported generated tokens and the first-to-last generated arrival interval. It does not count SSE chunks or show a browser rate from a single arrival. Gemini reports answer and reasoning tokens separately; the browser throughput covers both when reported. LM Studio is labeled **Local inference — no API charge**.

Usage and finish reasons come from the response stream when provided. OpenRouter's reported cost takes precedence over any estimate and may exclude charges from a separate upstream account. A text-only OpenRouter request can be estimated from compatible catalog rates when available; estimates are not billing records. Unavailable metrics, including most reasoning-effort values and those on older replies, show `N/A` rather than zero. Telemetry is saved locally with the reply and included in backups but is never sent in later chat requests. **Copy** copies just the raw reply Markdown. A native selection across a whole bubble or multiple bubbles also copies only Markdown; partial text selections inside one answer or expanded reasoning remain ordinary browser selections.

## Built-in JavaScript tool

Click **JS** in the composer to enable `javascript.execute` for the next reply in that chat. It is off by default and resets after sending. Use a model that supports native function calling. Luma uses the same internal tool contract with OpenAI, OpenRouter, LM Studio's OpenAI-compatible API, and Gemini's native `functionCall` / `functionResponse` format. Provider and model support can vary.

Each call runs synchronous JavaScript in a fresh QuickJS WASM instance inside a dedicated Web Worker. The worker receives only the code string. Guest code has no bridge to the DOM, network, browser storage, timers, imports, or provider credentials. Use `console.log(...)` and a final expression for output. Each run has a 1.5-second guest deadline plus an outer worker watchdog, a 16 MiB QuickJS heap cap, a 512 KiB stack cap, and at most 4 Ki characters of result and console text. Luma allows at most four executions across two tool-call rounds per reply and never runs additional code after stopping. Closing a tab does not resume unfinished runs.

Expand `javascript.execute` in a chat bubble to see the code, console, result, and status. **Stop generating** cancels both the pending response and the worker. Execution records are saved separately in IndexedDB and included in chat backups. Bounded tool results go back to the selected model during the same reply; raw tool records are not automatically sent in future turns or included in Workspace Inspector exports. Do not put secrets in prompts or tool code. Reply telemetry describes the latest model request, while each tool card shows its own execution time.

WASM and its Worker assets are bundled locally and precached when the PWA installs. The runtime works offline after caching; cloud model requests still need connectivity, and LM Studio still requires a reachable local server. `src/js-tool-runtime/` exposes `executeJavaScript({ code }, signal)` without any dependency on chat UI, providers, or IndexedDB.

## Data and offline behavior

Conversations, drafts, draft attachments, settings, and any encrypted saved keys are stored in IndexedDB on the current browser/device. Data is not automatically synchronized. Browser storage may be cleared or evicted; export backups regularly. Backups include conversations, attachments, and provider settings but never keys. Imports require a preview and explicit conflict handling. The importer accepts files up to 100 MiB; the exporter does not enforce that limit. Check the downloaded file size before relying on it for recovery. Import currently saves conversations individually, so a failed import can leave some changes applied. Back up existing data before overwriting it. If a conversation cannot be saved, the app does not send the message or retry, and keeps the draft visible.

After the production app has been loaded and cached, the shell and saved chats can be opened offline. The update button in the top bar shows the current app version and checks for a new build. Look for the status notification below the top bar. When an update is ready, finish active replies and close all app windows and tabs before reopening; the app does not force a reload. Cloud inference requires network access; LM Studio inference requires the local service to be reachable. The composer grows as you type and restores each conversation's draft and attachments. On desktop, Enter sends and Shift+Enter inserts a newline; on mobile, use the Send button. Images and plain text files up to 5 MB each can be added with the picker or drag and drop, and images can be pasted where supported. Image support must be known from the catalog or enabled in Providers for a model that accepts images. Do not attach content you do not want sent to the selected provider.

## Checks

```sh
npm test
npm run build
npm run test:browser
```

The authoritative theme tokens are `tokens/light.json` and `tokens/dark.json`. Generate the CSS consumed by the app with the pinned Style Dictionary CLI:

```sh
npx --yes --package style-dictionary@5.5.3 style-dictionary build --config tokens/light.config.json
npx --yes --package style-dictionary@5.5.3 style-dictionary build --config tokens/dark.config.json
```

Commit the generated CSS in `src/generated/` alongside the token sources. CI rebuilds it and fails if the output differs. If the background, text, or muted colors change, update the inline first-paint palette in `index.html` to match. Translations are maintained in `src/i18n.ts`; chat and model content are not translated.

The browser tests use an installed Chrome or Chromium and mocked LM Studio and OpenRouter endpoints; set `CHROME_PATH` when the executable is not in a standard location. They do not call a real model or cloud API. The reasoning test checks live rendering, usage-only SSE handling, raw Markdown copying, inspector export, and persistence. The LM Studio timing normalization also replays a subset of a real captured SSE response; replay is not a live provider check.

For a live check, start LM Studio on loopback with a chat model loaded, then run the opt-in test (PowerShell):

```powershell
$env:LMS_LIVE_URL = 'http://127.0.0.1:1234/v1'
npm.cmd test -- tests/lmstudio-live.test.ts
Remove-Item Env:LMS_LIVE_URL
```

Set `LMS_LIVE_MODEL` to choose a model; supply `LMS_LIVE_TOKEN` only if the server requires it. The test uses the app’s real request builder and SSE parser, sends a fixed prompt (not local history), and prints only numeric telemetry and its source. Browser CORS, loopback permission, and phone-to-server connectivity still require browser/device verification.

## GitHub Pages deployment

GitHub Pages is deployed by `.github/workflows/deploy.yml` on pushes to `main` or manual workflow dispatch. The workflow runs `npm ci`, unit tests, the production build, and browser regression tests before publishing `dist` to the `github-pages` environment. In repository Settings → Pages, set the source to GitHub Actions. The application uses relative asset paths so it works under the repository's Pages subpath. Deployment requires no API keys or repository secrets; users configure their own credentials in the app. Complete the separately required real-service and device checks before pushing a release.
