# Requirement.md — Luma Chat (PWA BYOK AI Chatbox)

- Project: https://github.com/yapweijun1996/PWA-BYOK-AI-Chatbox
- Live: https://yapweijun1996.github.io/PWA-BYOK-AI-Chatbox/
- Date: 2026-11-24
- Status: Draft v1 for owner review
- Convention: **[Fact]** = observed in README/ROADMAP or a cited source. **[Proposal]** = requirement I recommend. **[Unverified]** = needs a real test before it is trusted.

---

## 1. Product Summary

Luma Chat is a local-first, installable, bring-your-own-key (BYOK) AI chat PWA. It runs fully in the browser and talks directly to model providers. There is no backend, no account and no sync. [Fact]

Product goal: a private, fast, offline-capable chat workspace where the user owns both the key and the data, and where nothing leaves the device except the request to the chosen provider.

### Non-goals (from ROADMAP "out of scope")
- Accounts and cloud sync
- Additional providers beyond the current four (until M2 qualification passes)
- General-purpose plugin system

---

## 2. Current Baseline [Fact]

| Area | Current state |
|---|---|
| Providers | Gemini, OpenAI, OpenRouter, LM Studio (default `http://localhost:1234/v1`) |
| Storage | IndexedDB; single session snapshot restored in one read |
| Keys | In-memory per session; optional AES-GCM encryption with a user password; excluded from backups, logs and Inspector |
| Chat | Search (Ctrl/Cmd+K), rename, pin, archive/restore, projects, delete |
| Messages | Markdown + GFM, KaTeX, copyable code, raw HTML ignored, images load on demand |
| Extras | Reasoning display, per-reply telemetry (time, tokens, throughput, cost), attachments (image/text, 5 MB), import/export, Workspace Inspector |
| JS tool | Opt-in per reply, QuickJS WASM in a dedicated Worker, no DOM/network/storage/credential access |
| i18n / theme | English + Simplified Chinese; light/dark/system |
| PWA | Production precache (KaTeX, grammars, CSS, fonts, WASM); offline shell after first load; manual update button |
| Build / test | Vite; Style Dictionary tokens; `npm test` (57 passed, 1 skipped), browser regression with mocked providers |
| CI | GitHub Actions: generated-CSS check and Pages deploy |

---

## 3. Users and Key Scenarios

**Primary user:** a technical or semi-technical individual who already holds provider API keys and wants a private multi-provider chat client.

| ID | Scenario |
|---|---|
| S1 | Add a key, pick a model, chat with streaming output on phone or desktop |
| S2 | Switch provider/model per conversation without losing history |
| S3 | Use a local LM Studio model with no cloud involvement |
| S4 | Open the installed app on a plane and read/search old chats |
| S5 | Back up all data to a file and restore it on another device without keys |
| S6 | Lock the app so a stranger with the device cannot use stored keys |
| S7 | Run a short JS calculation safely inside a reply (optional beta) |

---

## 4. Functional Requirements

Priority: P0 = release blocker, P1 = must have for stable release, P2 = should have, P3 = later.

### 4.1 Provider and Model Layer
| ID | Requirement | Pri |
|---|---|---|
| FR-P1 | Support Gemini, OpenAI, OpenRouter and LM Studio through one provider interface with streaming, stop, retry and typed errors (auth, rate limit, CORS/network, quota, unsupported model). | P1 |
| FR-P2 | Model resolution order is fixed: request override > conversation override > global profile > app default. | P1 |
| FR-P3 | A model list must never be shown as proof that the key is authorized; show "unverified" until a real minimal request succeeds. | P1 |
| FR-P4 | Surface provider/CORS failures with a plain-language cause and a next action (e.g. "enable CORS in LM Studio"). | P1 |
| FR-P5 | Each provider has a qualification checklist run against the real service (with explicit user consent for paid calls) before it is labelled "supported". | P1 |
| FR-P6 | Add Anthropic only after M2, sending the required opt-in browser header (`anthropic-dangerous-direct-browser-access: true`). | P3 |

### 4.2 Credential Safety
| ID | Requirement | Pri |
|---|---|---|
| FR-K1 | **Release blocker:** when the LM Studio endpoint changes (manual edit or import), compare normalized destinations; if different, invalidate the old token and require explicit credential choice. Test with two mock endpoints and a dummy token. | P0 |
| FR-K2 | A key or token is only ever sent to the destination it was saved for (origin-bound credentials), for all providers. | P0 |
| FR-K3 | Default key lifetime is the session (memory only). Persistence is opt-in and encrypted with a password-derived key (AES-GCM). | P1 |
| FR-K4 | Key derivation uses a modern KDF with a stored salt and a documented iteration count (reference point: PBKDF2 at 600,000 iterations or stronger). | P1 |
| FR-K5 | Lock action wipes decrypted keys from memory; app auto-locks after a configurable idle time. | P2 |
| FR-K6 | Keys never appear in backups, logs, error reports, Inspector output, URLs or telemetry. Add an automated test that greps exports for a dummy key. | P0 |
| FR-K7 | Settings must show a short, honest threat-model note: encryption protects stored data, not an unlocked app against XSS or a compromised device. | P1 |
| FR-K8 | Offer guidance to users to create provider-side restricted keys with spend limits, and show it next to key entry. | P2 |

### 4.3 Data Integrity, Backup, Recovery
| ID | Requirement | Pri |
|---|---|---|
| FR-D1 | Export and import share one byte limit. Never label an unrestorable file as a successful backup; offer bounded per-group exports (e.g. by project or date). | P1 |
| FR-D2 | Import is atomic: validate everything first (duplicate IDs, negative sizes, schema version), collect all conflict choices up front, then commit conversations and settings in one IndexedDB transaction. | P1 |
| FR-D3 | Cross-tab safety: each chat has a revision number checked inside the write transaction; a stale tab cannot overwrite newer messages. Rejected drafts are preserved for reload or save-as-copy. | P1 |
| FR-D4 | Old backups remain importable (versioned schema with migrations). | P1 |
| FR-D5 | Request persistent storage (`navigator.storage.persist()`) and show storage usage and a "back up now" reminder. | P2 |

### 4.4 Chat Experience
| ID | Requirement | Pri |
|---|---|---|
| FR-C1 | Streaming render must not block input; long chats are virtualized. | P2 |
| FR-C2 | Edit/regenerate/branch a message; copy message; export a single chat as Markdown. | P2 |
| FR-C3 | Attachments: images and text up to 5 MB each; clear error for unsupported or oversized files. | P1 |
| FR-C4 | Reasoning text is shown separately from the answer and saved with the chat. | P1 |
| FR-C5 | Telemetry covers all provider rounds of a reply: per-round samples, separate elapsed vs generation time, sum only reported counts, mark partial totals. | P1 |
| FR-C6 | Markdown rendering never executes raw HTML; links open with `rel="noopener noreferrer"`. | P0 |

### 4.5 JavaScript Tool (Beta, Optional)
| ID | Requirement | Pri |
|---|---|---|
| FR-T1 | Opt-in per reply; ordinary chat must ship independently of this feature. | P0 |
| FR-T2 | Guest code receives only a code string; no DOM, network, storage or credentials. | P0 |
| FR-T3 | Defined outcomes: stop, timeout, oversized output, unsupported runtime, worker crash. | P1 |

### 4.6 PWA and Offline
| ID | Requirement | Pri |
|---|---|---|
| FR-W1 | Valid manifest, HTTPS, registered service worker with fetch handler, SVG-based icons (see 6.3). | P1 |
| FR-W2 | Keep each cached HTML shell paired with its own asset manifest so new HTML never loads with old/missing JS/CSS. | P1 |
| FR-W3 | Service worker cleanup is scoped by registration and must never delete caches of other same-origin apps. | P1 |
| FR-W4 | Update flow: detect new build, show "update ready", apply on user action, keep the previous build usable until swap. | P1 |
| FR-W5 | Offline: installed app opens shell and saved chats; cloud sends fail with a clear offline state and keep the draft. | P1 |
| FR-W6 | Mobile viewport is locked at scale 1 (`maximum-scale=1, user-scalable=no`) per the owner's PWA standard, with safe-area handling and keyboard-aware layout. | P1 |

### 4.7 Accessibility and i18n
| ID | Requirement | Pri |
|---|---|---|
| FR-A1 | Full English and Simplified Chinese journeys, including error messages and the key-safety notes. | P1 |
| FR-A2 | Keyboard operable; screen-reader labels for all controls; tap targets at least 44 px; contrast meets WCAG AA in light and dark. | P1 |
| FR-A3 | Because zoom is locked (FR-W6), provide an in-app text-size setting so the lock does not harm low-vision users. | P1 |

---

## 5. Non-Functional Requirements

| ID | Requirement | Target (to be confirmed by M5 benchmark) |
|---|---|---|
| NFR-1 | First usable paint (cached) | under 1.5 s on a mid-range phone |
| NFR-2 | Time to first streamed token overhead added by app | under 100 ms above provider latency |
| NFR-3 | Memory with 1,000 chats loaded | no runaway growth; measured before any refactor |
| NFR-4 | Storage | graceful behavior near quota; clear error, never silent loss |
| NFR-5 | Privacy | zero third-party analytics; no network calls except to the configured provider and static assets |
| NFR-6 | Security headers | strict CSP (no inline script, `connect-src` limited to known provider origins plus user-defined LM Studio URL), no eval outside the QuickJS worker |
| NFR-7 | Browser support | current Chrome/Edge (desktop and Android), Safari 17+ (macOS, iOS), Firefox as non-installable browser tab |

---

## 6. Constraints and Owner Standards

### 6.1 Architecture constraint [Fact]
No backend and no proxy. The README states direct browser use of keys is a deliberate trade-off that departs from the usual advice to keep keys server-side. This requirement set keeps that decision and compensates with FR-K1 to FR-K8.

### 6.2 CI constraint — conflict to resolve [Fact + Proposal]
The repo ships GitHub Actions (CSS check, Pages deploy, tests before publish). The owner's standing rule is no GitHub Actions on his repos; run checks locally. The only recorded exception is another project (Webpage-Design-Gallery). **Decision needed:** keep the Pages workflow as a second exception, or move to a local `npm run release` script that runs tests, builds and pushes `gh-pages`.

### 6.3 UI standards
- All icons are SVG, sourced from SVG-Icon-Studio (github.com/yapweijun1996/SVG-Icon-Studio). Missing icons are drafted and added there by PR.
- UI changes are judged on real screenshots (mobile and desktop, light and dark) before pushing.

### 6.4 Honesty standard
- No simulated or hardcoded model output presented as a working AI feature. Any mock UI must be labelled.
- Each provider is verified with a genuine end-to-end call on the published build before release notes claim support.

---

## 7. Research Findings

### 7.1 Direct-from-browser keys are a known, contested pattern
Provider communities report that OpenAI does not support exposing keys in browser apps, and users have requested a restricted client-side BYOK key type (OpenAI community thread, "Restricted BYOK API keys for client-side applications"). Libraries that store keys in the browser warn that the developer must prevent XSS and use a CSP, and that some kits do not encrypt `localStorage` keys at all (byokay-kit README). Another vault library states plainly that encryption does not defend against active script injection in the same origin and recommends a server proxy if that is in the threat model (byok-vault docs).
**Analysis:** Luma Chat's opt-in encrypted storage plus session-only default is a reasonable middle path, but XSS is the main residual risk. Hence strict CSP, no raw HTML, a sandboxed tool worker and origin-bound credentials are all P0/P1.
**Opposing view:** a thin stateless relay would remove the key from page scripts entirely, at the cost of the "no backend" promise and operator liability. Not adopted; revisit if the owner wants a hosted tier.

### 7.2 CORS differs per provider
- Anthropic accepts browser calls only with the header `anthropic-dangerous-direct-browser-access: true`; without it the API returns a CORS authentication error (Simon Willison, Aug 2024; multiple GitHub issues).
- One 2026 developer article states OpenAI does not return an `Access-Control-Allow-Origin` header for browser origins while Anthropic, Google and OpenRouter do. **[Unverified]** — the README lists OpenAI as supported but also warns that browsers may be blocked by CORS. FR-P5 must test OpenAI on the live build, and FR-P4 must handle the failure well.

### 7.3 PWA installability and iOS reality
- Baseline for installability: manifest, HTTPS, icon, and for Chrome a registered service worker with a fetch handler (MDN; web.dev; 2026 PWA testing checklist).
- Safari has no strict installation criteria and supports Add to Dock on macOS Sonoma+; Firefox does not support installing PWAs from a manifest on desktop (MDN).
- A 2026 article reports Safari may delete site data (including IndexedDB and service worker cache) after about 7 days without use when the app is not on the home screen. **[Unverified for current iOS]** — therefore FR-D5 (persistent storage request and backup reminder) matters for a local-only app whose only copy of data is on the device.
- Real-device testing is required: Android Chrome for install prompts, real iOS for standalone behavior; do not assume parity (2026 PWA testing checklist).

### 7.4 Known gaps in the project's own review [Fact]
ROADMAP findings are deductions from code, not observed failures; build, browser suite, live provider checks, real-device install/update and performance were not verified; the QuickJS worker and tool-turn integration were uncommitted at review; `docs/ISSUE-BACKLOG.md` (LC-01 to LC-12) is referenced but was not available to me.

---

### 7.5 E2E baseline on the live build (2026-11-24, macOS Tart VM `agent-sandbox`, Playwright/Chromium, 390x844) [Fact]
| Check | Result |
|---|---|
| Page loads, title "Luma Chat", version v0.2.0 | Pass |
| Empty state, composer disabled until provider+model chosen | Pass |
| "Configure a provider" opens Settings (Gemini/OpenAI/OpenRouter/LM Studio), one masked password input, security note shown | Pass |
| Manifest served (200), standalone, 192/512 PNG + SVG icons, apple meta present | Pass |
| Service worker registers and controls the page; cache `luma-shell-*` holds 34 entries | Pass |
| Offline reload after precache renders the app shell | Pass (body text shows full UI; my first visibility assertion was a test bug, not an app bug) |
| Viewport meta = `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` | **Fails FR-W6**: no `maximum-scale=1` / `user-scalable=no` |
| CSP `<meta>` tag | Not present (header-level CSP not checked; GitHub Pages cannot set custom headers) -> NFR-6 needs a meta CSP |
Not yet tested: real provider calls (needs a key or local LM Studio), import/export, two-tab conflict, update flow across builds, real iOS/Android install.

---

## 8. Delivery Plan (aligned with ROADMAP)

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0 Baseline | Split tool work from stable chat; PR checks; release branch; record rollback build | Chat ships without JS tool code path enabled |
| M1 Credentials and backups | FR-K1, K2, K6, D1–D4 | Two-endpoint token test passes; export/import round trip at size limit; old backups import |
| M2 Stable chat and offline | FR-W2, W3, W4, P5, A-series basics | Real-service qualification for all four providers with consent; update test across two builds |
| M3 Tool beta (optional) | FR-C5, T1–T3 | Multi-round telemetry correct; all tool failure outcomes tested |
| M4 Mobile and a11y sign-off | FR-W6, A1–A3 | EN and zh-CN journeys on real iOS and Android, installed mode, screen reader |
| M5 Measure then simplify | NFR benchmarks | Numbers recorded before any storage or `useWorkspace` refactor |

---

## 9. Acceptance Tests (minimum)

1. **Token isolation:** save dummy token for endpoint A, change to endpoint B, assert request to B carries no token.
2. **Backup secrecy:** set dummy key `sk-test-DUMMY`, export, assert the string is absent from the file, Inspector JSON and console logs.
3. **Round trip:** export max-size dataset, import on a clean profile, assert byte-equal conversations.
4. **Atomic import:** inject a bad record in the middle of a file; assert zero changes were written.
5. **Two-tab conflict:** edit the same chat in two tabs; assert the stale save is rejected and the draft preserved.
6. **Offline update:** install build A, publish build B, go offline mid-update; assert the app still loads with a matching shell and assets.
7. **Viewport lock:** assert meta viewport contains scale-lock; pinch zoom does nothing on a real phone.
8. **Live provider check:** for each provider, one real streamed reply on the published build, plus a stop and a forced auth failure.
9. **CSP:** assert no inline-script violations and that `connect-src` blocks an arbitrary host.

---

## 10. Open Questions for the Owner

1. CI: keep the GitHub Pages workflow as an exception, or switch to local release scripts?
2. Is Anthropic a wanted provider after M2?
3. Should persisted keys use a passkey (WebAuthn) option in addition to a password?
4. Target devices for M4 sign-off (which iPhone and Android models)?
5. Is a one-click "reset everything" and an auto-backup-to-file reminder acceptable UX?

---

## References

- Project README and ROADMAP: github.com/yapweijun1996/PWA-BYOK-AI-Chatbox (README, ROADMAP.md)
- OpenAI community: "Feature request: Restricted BYOK API keys for client-side applications" — community.openai.com/t/feature-request-restricted-byok-api-keys-for-client-side-applications/1392506
- byokay-kit README (localStorage keys not encrypted; developer must prevent XSS) — unpkg.com/byokay-kit@0.1.8/README.md
- byok-vault security reality check — floaredor.github.io/byok-vault
- Byoky extension (AES-256-GCM, PBKDF2 600,000 iterations) — addons.mozilla.org/addon/byoky/
- Simon Willison, Anthropic CORS header — simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access
- Provider CORS comparison article — horadecodar.com.br/?p=45706
- MDN, Making PWAs installable — developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_Installable
- PWA mobile testing checklist 2026 — mobileviewer.github.io/pwa-mobile-testing-checklist-2026
- iOS PWA storage isolation (Habr, Jan 2026) — habr.com/en/articles/989862
