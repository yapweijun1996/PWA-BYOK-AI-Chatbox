# Luma Chat: engineering review and delivery plan

## Browser-first Agent roadmap

The Agent track builds on the current chat, tool, and IndexedDB behavior. This roadmap describes planned work. The reliability review below records an earlier baseline. See the [product goal](goal.md), [architecture](docs/BROWSER-FIRST-AGENT.md), and [delivery checklist](task.md#browser-first-agent-tasks).

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| P0 · Composer tools and runtime | Offer compatible local tools by default. Users can control availability from **+ → Tools**. Create a task on the first valid CSV tool call and reuse the provider adapters, cancellation and chat UI. | Verify saved off preferences survive upgrade, tools are omitted when off, plain replies stay in chat, and a CSV run shows progress and stop reason. [Interaction specification](docs/COMPOSER-CSV.md#composer-交互) |
| P0 · File scope and recovery | Support selected files and user-authorized directories. Apply the selected permission level to directory operations and add branch-bound checkpoints. CSV analysis keeps its source read-only. | Refresh offers a deliberate resume. Unauthorized files stay out of tools and provider requests. An uncertain external write is never replayed automatically. [File access design](docs/BROWSER-FILE-ACCESS.md) |
| P0 · CSV input and output | Parse the selected CSV in a Worker, validate columns and records, and render preview and export from a shared monthly summary. | Verify precise totals, explicit row errors, and matching preview and download on desktop and mobile. Release after all P0 slices pass. [CSV specification](docs/COMPOSER-CSV.md#csv-输入) |
| P1 · Context | Add branch-scoped context summaries and richer usage reporting. Evaluate approval for memory operations separately. | Trace summaries to their source branch and distinguish reported, estimated, and unknown usage. |
| P2 · Extensions | Evaluate restricted tool extensions and multi-agent runs against concrete user workflows. | Adoption depends on capability scoping, controllable cost, and demonstrable value in the browser. |

## Historical reliability review

**Release recommendation:** ship recovery and credential-safety fixes before expanding model capabilities. Keep ordinary chat independently releasable from the experimental JavaScript tool. This is an engineering backlog, not a list of promised features or dates.

## Review baseline

Reviewed local `main` at `78cb1fc` plus the working-tree changes to tool execution, request configuration, Vite, the service worker, and tests. The workspace inspector is in local HEAD; the QuickJS worker and tool-turn integration were uncommitted at review. Neither Git status nor this document establishes what is deployed. The design intent is in [DESIGN/DESIGN.md](DESIGN/DESIGN.md); setup and existing features are in the [README](README.md).

The main send path is **composer → `useWorkspace.send` → persist user message and assistant placeholder → `runReply` → provider stream → in-memory updates and IndexedDB checkpoints**. The initial save gates network I/O; keep that invariant for retries and tools. `requestHistory` selects user messages and completed assistant replies. Diagnostic exports and backups serve different purposes: diagnostics should exclude content; backups intentionally contain private conversations. The service worker owns shell caching, not conversation storage.

Evidence: `npm test` with live LM Studio disabled: **57 passed, 1 skipped**. Findings below are deductions from the named code paths, not failures observed on user devices. Build, browser suite, live providers, install/update on real devices, and performance measurements were not verified in this review.

## Prioritized findings and fix tickets

### 1. Credential reuse after an LM Studio endpoint change — P0, release blocker

`src/use-workspace.ts` (`finishImport`, `updateConfig`, `prepareReply`, `loadCatalog`) keeps session secrets by provider ID. An accepted settings import can change the LM Studio endpoint while explicitly retaining the current vault; a manual endpoint edit likewise does not rebind the credential. `src/providers.ts` sends the chosen provider secret to the configured destination. A legitimate move to another server can therefore send a token intended for the previous server. Import alone does not send a request.

**Task:** compare normalized destinations before applying transport changes. Show the changed destination in the import preview, invalidate session authorization for the old destination, and require explicit credential selection for the new one. Apply the same rule to catalog checks, chat, retry and encrypted-key unlock; keep fixed cloud endpoints fixed. **Done when:** with two mock endpoints and a dummy credential, changing A to B by either path never sends A's token to B. Unchanged destinations continue working; old vaults can be recovered deliberately without silently trusting a new destination.

### 2. A successful export can be impossible to import — P1, data recovery

`exportData` in `src/use-workspace.ts` serializes every conversation, including attachments, without a size check. `importFile` rejects files larger than 100 MiB before parsing. Thus the app can download its own backup and reject that same file on restore. Simply removing the guard would move the problem to mobile memory use.

**Task:** share a byte limit between reader and writer; measure the actual serialized blob. Offer a supported recovery path such as bounded conversation-group exports, with a clear outcome for a single oversize chat. **Done when:** accepted exports round-trip into an empty profile; tests cover just below/above the limit, multibyte text, and attachments. Never label an unrestorable download as a successful backup.

### 3. Import is not one recoverable operation — P1, data integrity

`finishImport` commits and publishes each conversation separately, then asks about preferences and saves projects/settings. If the second conversation or the settings write fails, earlier overwrites survive. The error path does not identify which records were replaced. `validBackup` in `src/data-contracts.ts` also accepts duplicate conversation/message IDs and a finite negative attachment size. The import preview is not an integrity guarantee.

**Task:** validate IDs, statuses and attachment metadata before any writes; distinguish duplicates within the file from conflicts with existing data. Collect all choices up front. Prefer one IndexedDB transaction across `conversations` and `settings` for a bounded import; publish the session projection only after commit. Preserve local vaults and version-1 compatibility. **Done when:** an injected failure on the second record leaves original records and project membership unchanged after reload; skip/overwrite, invalid duplicates, and a pre-project backup have fixtures.

### 4. Two tabs can silently overwrite the same conversation — P1, lost edits

`src/storage.ts` (`restore`, `saveConversation`) restores a snapshot and uses unconditional `put(value)` for a whole chat. The per-chat queue in `useWorkspace` orders writes within one tab, not across tabs. With both tabs open on the same chat, an older draft snapshot from one can replace messages saved by the other.

**Task:** add a per-chat revision checked inside the same read/write transaction as the update. Reject a stale write, keep its unsaved draft accessible, and offer reload or save-as-copy. A notification between tabs can improve the UI but cannot replace the transactional check. **Done when:** a two-page browser test interleaves draft, send and deletion; neither a stale overwrite nor resurrection of a deleted chat succeeds silently. A rejected initial send makes no provider request.

### 5. Offline shell can point to a different build's assets — P1, PWA reliability

`public/sw.js` fetches navigations from the network and writes successful HTML to the active cache's `./` key. `vite.config.ts` generates a revisioned precache with hashed assets. During deployment the old active worker can replace its cached HTML with the new build's HTML before the new asset set is installed. Runtime asset misses fetch without storing. An offline reload in that window may find HTML but not its referenced JS/CSS. Activation also deletes all origin caches starting with `luma-shell-`, not just those owned by the current registration scope.

**Task:** keep the installed shell and its asset manifest immutable as a pair; namespace cleanup by registration scope. Preserve the existing non-forced update during replies. **Done when:** serve build A then B under the real Pages subpath, interrupt B installation, disconnect, and open A offline. After a complete update B opens offline. Updating one of two same-origin scopes leaves the other's cache intact.

### 6. Multi-round reply telemetry reflects only the last request — P1 for tool beta

In `useWorkspace.runReply`, content and execution records accumulate across `runToolTurn`, but `tracker` is recreated per provider request and `roundTelemetry` is replaced. A footer for the entire reply can consequently display only the final round's duration, usage or cost. This is especially misleading when the first request used more tokens than the final answer.

**Task:** retain per-round samples; distinguish end-to-end elapsed time from provider generation time. Sum only compatible, reported counts and costs; mark partial totals and never average token rates as if they were counts. **Done when:** fixtures cover two rounds with different usage, a missing usage event, and cancellation after the first billable round. Single-request and historical replies remain readable without migration.

## Delivery sequence

For copy-ready issue titles, priorities, dependencies, and acceptance tests, see the [implementation backlog (LC-01–LC-12)](docs/ISSUE-BACKLOG.md).

| Milestone | Work and dependencies | Release evidence |
| --- | --- | --- |
| **M0 — establish the baseline** | Separate tool WIP from stable chat. Add PR checks reusing `.github/workflows/deploy.yml`'s Node 24 tests, generated-token check, build, and browser tests; restrict publish to release/main. | A clean checkout produces a Pages artifact; PRs cannot deploy. Record candidate SHA and rollback build. |
| **M1 — protect credentials and backups** | Fix 1 first. Coordinate 2 and 3 around one version-1 reader/writer contract. Add 4 before relying on the import transaction in multiple windows. | Dummy-token destination tests, restore into a fresh profile, quota/transaction-abort fixtures, two-tab conflict test. Old backups still import; backups and diagnostics exclude vaults. |
| **M2 — qualify stable chat and offline updates** | Fix 5. Extend `tests/pages-subpath.mjs`, `tests/update-smoke.mjs` and startup recovery tests with two distinct production builds. Exercise Gemini, OpenAI, OpenRouter and LM Studio separately; catalog success is not chat authorization. | Offline reopen/draft/update passes. Document real-service results or explicit unknowns, including browser CORS, optional LM Studio auth, phone-to-LAN access, rate limits, stop/retry. Use fixed prompts with consent for any paid check. |
| **M3 — tool beta (optional)** | After M1, fix 6. Build on `tests/javascript-tools.test.ts` and `tests/tool-execution-smoke.mjs`, not a second framework. Keep per-reply opt-in; explain that results return to the provider and can trigger another charge. | Production worker loads at a subpath. Stop, timeout, oversized output, interrupted recovery and unsupported runtime have clear outcomes; a later ordinary chat neither enables tools nor sends past execution records. Hold beta, not stable chat, if checks fail. |
| **M4 — mobile and accessibility sign-off** | Exercise the design brief's journeys in English and Simplified Chinese, with real mobile keyboards, IME, drawer focus, zoom, reduced motion and screen readers. Verify iOS home-screen and Android installed mode separately from Chromium emulation. | User can configure, send, stop, export, restore and navigate errors without a mouse. Publish device/browser exceptions instead of claiming universal PWA support. |
| **M5 — measure, then simplify** | `storage.restore` uses `getAll()` and streaming checkpoints can persist an entire chat roughly every 500 ms. Measure startup-to-interactive, peak memory, and checkpoint latency on small, long, and attachment-heavy workspaces before changing schema. Extract import and provider-turn orchestration from `useWorkspace` behind the tested contracts above. | Before/after measurements on one representative phone and desktop. If lazy history or separate blob storage is justified, require interrupted-migration and backward-backup fixtures. No schema rewrite just to shorten the hook. |

**Definition of done per fix:** add the failing regression first; verify the new behavior after reload as well as in memory; run `npm test`, `npm run build`, and `npm run test:browser` against the candidate. Update user-facing recovery instructions and both UI languages when behavior changes. Record what was mocked, what ran on a device, and what remains unverified. Accounts, sync, extra providers and general-purpose plugins are outside this reliability plan.
