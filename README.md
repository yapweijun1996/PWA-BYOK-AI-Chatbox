# Luma Chat

Luma Chat is a local-first, installable BYOK AI chat application. It supports direct browser connections to Gemini, OpenAI, Anthropic, OpenRouter, and LM Studio. The design references in `DESIGN/` describe the intended visual direction; this is an independent implementation.

The UI supports English and Simplified Chinese. Use **Settings → Appearance** to choose a language and a light, dark, or system theme. **Settings** also contains AI providers and Local data.

The top bar provides model selection, conversation actions, language and theme controls, IndexedDB status, and update checks. On smaller screens, additional actions are in the more menu. The provider indicator reflects the latest request for the current provider, model, and session credentials. A successful model-list request is labeled separately from a successful chat request. IndexedDB status reflects a local read check and the latest local write outcome; browser storage quota and the separate localStorage theme hint are shown elsewhere. The update control shows the installed package version and reports checking, current, waiting, offline, and failure states. A compatible waiting service worker reports its package version; older workers show an available update without a version.

The composer grows with the draft and can be expanded for longer prompts. The expanded editor uses the same locally saved draft and attachments; close it with its button or Escape. While expanded, background controls are inactive and notifications remain available inside the editor. The model selector and local tools control remain available in either size. Desktop Enter sends and Shift+Enter adds a line; mobile Enter adds a line. The local tools control enables browser-side tools whose results are sent to the selected provider.

Draft attachments show their count, file names, type and size, with image thumbnails where available. The attachment list scrolls when needed; keyboard focus moves to the next attachment or the message field after removal. Image and plain text files are limited to 5 MB each.

Message bubbles display their local time, with a full date and time on hover. The latest assistant reply can be retried after selecting the current or original model and confirming the request; previous answers remain visible and later requests use the latest answer. **Edit as new message** copies a user message and its attachments to the composer without altering history or sending automatically. Replacing an existing draft requires confirmation; cancelling the edit restores the prior draft and attachments, even after a reload. The edited draft replaces that saved prior draft once sent.

Use the [feature map](FEATURE-MAP.md) to find a capability, its implementation, and its limits. For the source review, prioritized bugs, implementation tasks, and release criteria, see the [engineering roadmap](ROADMAP.md). It distinguishes committed functionality from work in progress; it is not a release announcement.

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

Use **New chat** or **Search conversations** in the sidebar, or press `Ctrl/⌘ + K` to search titles, message text, and project names locally. Conversation action buttons can rename, pin, archive, move, or delete chats. Archived conversations are hidden from the main groups and can be opened or restored from **Archived**. The row moves only after the archive or restore commits. Archiving the active chat saves its replacement selection in the same transaction; if that fails, the original row and selection stay in place so you can retry. A pinned chat appears only under **Pinned**, even when it belongs to a project. Unpinning returns it to its project or to Recent. Projects can be created and renamed; move all assigned conversations out (including archived conversations) before deleting an empty project.

On desktop, drag the sidebar's right edge, or focus the separator and use Left/Right (Home/End for limits). Width and collapsed state are restored before revealing the app. The mobile drawer opens over the chat rather than resizing it. Projects and conversation organization live in the existing IndexedDB stores and are included in version-1 backups; older backups still import. API keys are not exported.

## Configure a provider

Anthropic uses its Messages API directly from the browser, including its direct-browser opt-in header. Requests use a 4,096-token output limit and support text, images on enabled models, streaming, and local tool calls. The API key is accessible to the running page; use a trusted device and browser environment. Provider browser access and account limits may change, and requests can incur charges.

Open **Settings → AI providers** to configure a provider's model and credentials. Browsing a provider tab does not switch the chat recipient. Choose **Set as default provider** for chats that inherit the global model, or choose a model explicitly in the composer. The model list does not prove a key or chat request is authorized; some providers expose a public catalog. The app connects directly from the browser; it has no proxy or backend. A provider can reject browser requests because of CORS or other restrictions. OpenRouter uses its own key and model IDs, such as `thinkingmachines/inkling-2-mini`; listing the model does not guarantee access or available credits.

Use **Choose model** in the composer to search configured models and catalogs you load on demand. The toolbar uses short names, while the selector shows full model IDs. The composer offers reasoning as a supported on/off option rather than model-specific effort levels. The composer also includes experimental local tools, enabled by default. When enabled, tools run locally and their results are sent to the selected provider for a follow-up request, which may incur charges. Changing the model clears unverified capabilities instead of carrying them over from the previous model.

Type `/` alone in the composer to open local slash commands. Use the arrow keys and Enter, or tap an option, to start a new chat, search, choose a model, open provider settings, or toggle local tools. Escape or the close button dismisses the menu so the text can be sent as an ordinary message. Command names only match when the entire draft is a slash and a command prefix; other text and attachments remain in the conversation.

For LM Studio, start its server and enable CORS. The default base URL is `http://localhost:1234/v1`. Choose **Edit server address**, enter the HTTP(S) base URL (including any custom path), then **Apply address**. Cancel discards the edit without changing the current destination or token. Credentials, query strings and fragments do not belong in the URL. Backups omit invalid legacy addresses with a notice; importing an invalid or omitted address keeps the current destination. Authentication is optional when disabled in LM Studio; use a token when it is enabled. Tokens are bound to the server base URL (including its path). Changing the destination manually or by importing provider settings clears the session token. An encrypted token can be unlocked at its original address; enter a separate token for another server. Unlocking a token saved by an older build asks you to confirm its destination once. On a phone, `localhost` means the phone: use the computer's accessible LAN address and configure LM Studio to serve on the local network. Browser local-network permission, HTTPS mixed-content rules, CORS, and firewall settings vary. Enable authentication when exposing the server; plain HTTP can expose prompts and tokens to the network. A trusted HTTPS connection is preferable. Browser and device support must be verified for the actual environment.

The app keeps session keys in memory until lock, reload, or close. Opt-in encrypted storage uses a password-derived AES-GCM key. Losing the password prevents recovery. Encryption protects stored ciphertext from some device-storage exposure; it does not protect a key while the app is unlocked from malicious page scripts or a compromised device. API keys are excluded from backups and are never intentionally logged. Cloud providers receive submitted messages and attachments. Direct browser key use is a deliberate user-selected tradeoff and does not meet OpenAI's recommendation to keep API keys on a server.

When a provider supplies reasoning text in its stream, Luma Chat displays it separately from the final answer and saves it with the conversation and backups. LM Studio supports structured reasoning fields and leading `<think>` tags; OpenRouter supports its text and summary reasoning details. For OpenRouter or Gemini, request reasoning in provider settings only for a supported model; content is not guaranteed and may affect cost. OpenAI Chat Completions does not expose raw reasoning, so it may show no reasoning text. Reasoning displayed in the app is not sent back in later chat requests.

## Rich messages

Chat and reasoning bubbles render CommonMark and GitHub Flavored Markdown, including checklists, tables and links. Use `$…$` for inline math and `$$` on separate lines for display math. Code fences show a language label and can be copied independently of the whole reply; supported languages are highlighted, while unknown languages remain plain text. Long code, tables, and equations scroll within the bubble.

During streaming, completed blocks stay rendered and the still-changing trailing block appears as literal text. The final pass renders the complete Markdown; IndexedDB and backups keep the original source. New content follows the conversation bottom only while you are there. Raw HTML is ignored, unsafe links are disabled, and images are fetched only if you explicitly load them. External images still require their host to be reachable. KaTeX, syntax grammars, CSS and WOFF2 fonts are served locally and precached with the production PWA.

## Workspace Inspector and configuration ownership

Open **Workspace Inspector** from the top bar. Its read-only Runtime, Context, Configuration, Telemetry, Storage, and PWA tabs show value provenance, the active request, a selectable historical reply, and actual database and service-worker status. The JSON export is a diagnostic summary, not a backup: it omits credentials, headers, endpoint addresses, model identifiers, conversation IDs, raw messages, reasoning, drafts, and attachments. Connection targets are classified by transport and loopback/network instead of exporting the URL. Browser storage quota and usage are origin-wide estimates.

IndexedDB is the persistent repository. Startup restores a single workspace session projection, and UI controls call shared actions against it. Uncommitted drafts and streamed checkpoints stay in the session until written; the inspector distinguishes in-memory state from persisted records. Credential inputs are transient, session keys are separate from preferences, and encrypted vault storage is never inspected or exported by the inspector. Theme hints are only for first paint; browser and service-worker status come from their platform owners.

Model configuration resolves **request override → conversation override → global profile → app default**. In AI providers, use **Use this model for the current chat** to make model and capability changes in the composer conversation-specific, or **Use global model settings** to inherit again. Transport endpoints and credentials still belong to the provider, not the conversation. **Retry with original model** reuses the previous request’s model/capability selection with the provider’s current endpoint and credential. Each new reply stores the resolved request facts separately from Markdown and telemetry; older replies are not backfilled. Global values identical to defaults without a model profile are presented as default values.

Before an existing chat sends history to a new cloud provider, Luma names the recipient and offers **Send with history**, **Start an empty chat**, or **Cancel**. This also applies to retries. Starting fresh opens a blank chat with the selected model, sends nothing, and leaves the original draft and attachments in place. Continuing with the same cloud provider does not prompt again. A local-model turn resets that choice; older and imported conversations with history ask on first cloud use. This permission is stored on the device and is not part of backups.

## Response telemetry

Each assistant reply has a compact telemetry footer and an expandable **Response inspector**. Client timing begins when the app starts the provider request, after saving the message: TTFT measures arrival of the first generated text or reasoning delta, TTFV the first nonblank answer text, and duration through completion or interruption. LM Studio and OpenAI request streaming usage, including a terminal event with usage but no choices. For LM Studio, TPS prefers the server’s `timings.predicted_n ÷ timings.predicted_ms × 1000`; it does not mix that duration with standard usage counts. Without server generation timings, a browser estimate uses reported generated tokens and the first-to-last generated arrival interval. It does not count SSE chunks or show a browser rate from a single arrival. Gemini reports answer and reasoning tokens separately; the browser throughput covers both when reported. LM Studio is labeled **Local inference — no API charge**.

Usage and finish reasons come from the response stream when provided. OpenRouter's reported cost takes precedence over any estimate and may exclude charges from a separate upstream account. A text-only OpenRouter request can be estimated from compatible catalog rates when available; estimates are not billing records. Unavailable metrics, including most reasoning-effort values and those on older replies, show `N/A` rather than zero. Telemetry is saved locally with the reply and included in backups but is never sent in later chat requests. **Copy** copies just the raw reply Markdown. A native selection across a whole bubble or multiple bubbles also copies only Markdown; partial text selections inside one answer or expanded reasoning remain ordinary browser selections.

## Built-in JavaScript tool

Local tools, including `javascript.execute`, are enabled by default. Click **Tools** in the composer or use `/js` to turn them off or back on. The setting applies across chats and persists across replies and reloads. Use a model that supports native function calling. Luma uses the same internal tool contract with OpenAI, Anthropic, OpenRouter, LM Studio's OpenAI-compatible API, and Gemini's native `functionCall` / `functionResponse` format. Provider and model support can vary.

The same control enables five additional local tools. `time_tool` gets the current time, converts an instant to an IANA time zone, or computes a date interval. `calculate` evaluates JavaScript in the sandbox. `analyze_file` summarizes or reads text, CSV, and JSON attachments already present in the current conversation. `text_tool` searches, replaces, sorts, deduplicates, or extracts regex matches. `memory_tool` lists keys and reads, saves, or deletes named local memories. File names must identify one attachment unambiguously. Model tool use and the existing round and output limits apply to all six tools.

Manage local memories under **Settings → Local data**. Each device stores up to 100 entries, with a 120-character key and a 2,000-character value. Memory entries are not included in backups or synchronized between devices. Chat backups still include tool execution records, which may contain memory values. Clearing local data deletes the memory entries too. When the model calls a tool, its bounded result is sent to the selected provider as part of the current reply.

Each call runs synchronous JavaScript in a fresh QuickJS WASM instance inside a dedicated Web Worker. The worker receives only the code string. Guest code has no bridge to the DOM, network, browser storage, timers, imports, or provider credentials. Use `console.log(...)` and a final expression for output. Each run has a 1.5-second guest deadline plus an outer worker watchdog, a 16 MiB QuickJS heap cap, a 512 KiB stack cap, and at most 4 Ki characters of result and console text. Luma allows at most four executions across two tool-call rounds per reply and never runs additional code after stopping. Closing a tab does not resume unfinished runs.

Expand `javascript.execute` in a chat bubble to see the code, console, result, and status. **Stop generating** cancels both the pending response and the worker. Execution records are saved separately in IndexedDB and included in chat backups. Bounded tool results go back to the selected model during the same reply; raw tool records are not automatically sent in future turns or included in Workspace Inspector exports. Do not put secrets in prompts or tool code. Reply telemetry describes the latest model request, while each tool card shows its own execution time.

WASM and its Worker assets are bundled locally and precached when the PWA installs. The runtime works offline after caching; cloud model requests still need connectivity, and LM Studio still requires a reachable local server. `src/js-tool-runtime/` exposes `executeJavaScript({ code }, signal)` without any dependency on chat UI, providers, or IndexedDB.

## Data and offline behavior

Conversations, drafts, draft attachments, settings, and any encrypted saved keys are stored in IndexedDB on the current browser/device. Data is not automatically synchronized. Browser storage may be cleared or evicted; export backups regularly. Backups include conversations, attachments, and provider settings but never keys. Import and export use the same 100 MiB limit for the actual UTF-8 JSON file. If the workspace does not fit, download each offered group and import the files one at a time. Each file has complete conversations, attachments, project definitions and portable preferences. If a conversation cannot fit even alone, it is named and excluded, not truncated or deleted.

Opening the same workspace in two tabs does not live-sync their screens. With the current app in both tabs, each conversation update or deletion checks the version the tab last read or committed, inside the IndexedDB write transaction. A stale draft or reply stays visible. Choose **Save a separate copy** before closing the tab to keep its messages, draft and files under a new ID, without changing or recreating the original. This action makes no provider request. A send that encounters a stale or missing conversation at its initial local save makes no request either. Older records acquire a device-local revision on their next write; backups do not carry revisions. Preference edits merge against the latest saved settings, so changing the theme does not revert another tab’s provider, projects or keys. Conflicting edits to the same provider profile are rejected rather than mixing model capabilities.

**Clear all local data** deletes saved chats, attachments, settings and encrypted keys in one IndexedDB transaction. Clearing is unavailable during an active reply or import transaction. Once you confirm, this tab ignores results from earlier key operations and backup reads: a late unlock cannot restore a session key, and a late file read cannot reopen an import preview. The form, unlocked keys, preview and one-reply JS choice reset only after deletion commits. Cancelling changes nothing; if storage rejects the delete, the existing workspace stays available for backup or retry. This does not erase downloaded backups or the offline app shell. Other open tabs retain their in-memory sessions; close them to end those sessions.

Import validates the file before preview. Choose whether to apply provider and appearance settings (off by default), then skip or explicitly replace matching conversations. Projects merge by ID, keeping existing project names. Each file is committed in one IndexedDB transaction, including any selection change. An aborted import leaves the prior workspace and its encrypted keys intact. If a record to be replaced changed since preview, save your work and reload before previewing again. Atomicity is per file, not across separate group imports.

If the initial save fails, the app makes no provider request and keeps the draft visible. When generation finishes, stops, or fails, the reply remains visible while its final local write is pending. **Saved locally** refers to the reply, not to an unsaved draft. If the write fails, **Retry local save** writes the visible reply and current draft without contacting the model. If storage stays unavailable, export before closing or reloading.

Once the production service worker finishes installing, the app opens its installed HTML and assets online or offline. The worker pins the exact shell, scripts, styles, icons, fonts and local JS runtime by digest. If a deployment is interrupted or serves bytes from another build, the candidate does not install; the existing build remains usable as long as its cache is retained. Each registration manages only its own build caches. Older caches without an identifiable scope are left alone.

The version button checks for updates and automatically installs a compatible update, showing a full-screen progress screen while saving local drafts and restarting. Finish any active task and resolve local save failures first; if another Luma Chat tab or window is open, close it and try again so its work is not interrupted. Older waiting workers cannot be activated automatically: close all Luma Chat tabs and windows and reopen to complete that update. Existing installations using older app code must first reopen to receive this behavior. Cloud inference requires network access; LM Studio inference requires the local service to be reachable. The composer grows as you type and restores each conversation's draft and attachments. On desktop, Enter sends and Shift+Enter inserts a newline; on mobile, use the Send button. Images and plain text files up to 5 MB each can be added with the picker or drag and drop, and images can be pasted where supported. Image support must be known from the catalog or enabled in Providers for a model that accepts images. Do not attach content you do not want sent to the selected provider.

## Checks

```sh
npm test
npm run build
npm run test:browser
```

The authoritative theme tokens are `tokens/light.json` and `tokens/dark.json`. Generate the CSS consumed by the app with the pinned Style Dictionary CLI:

Scrollbar thumb, hover and track colors also come from these theme tokens. Fine-pointer devices use thin scrollbars; touch and forced-color modes retain the browser defaults.

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
