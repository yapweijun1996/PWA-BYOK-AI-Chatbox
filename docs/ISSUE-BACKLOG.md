# Luma Chat implementation backlog

Each heading is a proposed issue title. Copy the metadata, scope and checkboxes below it into the issue tracker. `LC-*` are planning IDs, not GitHub issue numbers. “Depends on” means required to **close** the ticket; regression tests can be drafted earlier. See the [engineering review](../ROADMAP.md) for source evidence and the shared definition of done.

**Start LC-01 and LC-02 in parallel.** LC-02 is the credential release blocker. LC-03 and LC-04 can proceed independently, then feed LC-05. LC-06 does not depend on storage changes. Stable chat sign-off needs LC-01–07 and LC-10; LC-08–09 block only a tool-enabled release. LC-11–12 are follow-up improvements, not release gates.

### LC-01 — Validate pull requests without granting deployment access

M0 · P1 · CI/release · Depends on: none

Reuse the Node 24 checks in `.github/workflows/deploy.yml` for pull requests. Record the stable candidate SHA, tool inclusion decision and last known good Pages build; don't bundle unrelated working-tree edits.

- [ ] On a PR, a clean `npm ci`, unit tests, token drift check, production build and browser suite run. A failing check fails validation; no Pages deployment or write token is available to the PR job.
- [ ] On an authorized main release, deployment consumes the checked artifact. Document how to redeploy the prior revision without clearing IndexedDB.

### LC-02 — Bind LM Studio credentials to the approved destination

M1 · P0 · Credentials · Depends on: none · Finding 1

Cover manual endpoint edits and settings imports in `src/use-workspace.ts`; enforce the same destination rule for catalog, chat, retry and unlock. Compare normalized endpoints, not display strings. Preserve the fixed cloud destinations and optional unauthenticated LM Studio flow.

- [ ] With mock servers A/B and a dummy token for A, edit or import B's address. No request to B carries A's token; explicitly authorizing B permits its own credential.
- [ ] Import preview identifies the destination change before confirmation. Cancel leaves the endpoint and credential unchanged; an equivalent normalized endpoint does not trigger a false change.
- [ ] A legacy encrypted credential remains recoverable but never silently authorizes a different destination after reload. Neither backups nor diagnostic exports contain the dummy token.

### LC-03 — Only offer backups the importer can restore

M1 · P1 · Backup · Depends on: none · Finding 2

Share a serialized-byte budget between `exportData` and `importFile`. Keep the import bound; provide conversation-group export when the full workspace is too large.

- [ ] At limit minus one byte and exactly at limit, restore a supported export into a fresh profile. At limit plus one, offer smaller groups rather than reporting backup success. Use a configurable small budget in unit fixtures.
- [ ] Cover multibyte text, attachments, and a single chat that cannot fit. Explain the last case without deleting data. Restoring supported groups preserves messages, attachments and project membership, not keys.

### LC-04 — Reject stale writes across workspace tabs

M1 · P1 · IndexedDB · Depends on: none · Finding 4

In `src/storage.ts`, check the expected conversation revision in the write transaction. Distinguish creating a record from updating a deleted one. Surface conflicts without losing the visible draft.

- [ ] In two pages on one origin, A edits after B has loaded. B's stale save leaves A's text intact after reload and offers B a recoverable copy.
- [ ] Delete in A, then send from stale B. No resurrection, no provider request, and the draft remains available. Existing records without a revision still load and can be edited.

### LC-05 — Validate and commit backup imports atomically

M1 · P1 · Data integrity · Depends on: LC-02, LC-03, LC-04 · Finding 3

Validate the v1 payload in `src/data-contracts.ts`. Resolve skip/overwrite and preference choices before writes. Commit selected records and settings together; publish session changes only after commit.

- [ ] Reject duplicate conversation IDs, duplicate message IDs within one chat, negative attachment sizes and invalid statuses before any writes. Distinguish malformed input from valid conflicts with local records.
- [ ] Force the second write to fail. After reload, previous chats, projects, settings and vaults are unchanged. An edit in another tab after preview is not silently overwritten.
- [ ] Import a pre-project v1 fixture and a grouped export; verify skip, overwrite, cancellation and credential-destination rules.

### LC-06 — Keep an offline shell paired with its installed assets

M2 · P1 · PWA · Depends on: none · Finding 5

Change navigation caching in `public/sw.js` and cache naming in `vite.config.ts` so a pending deployment cannot overwrite the active shell. Limit cleanup to the registration's scope.

- [ ] Extend the Pages/update browser harness with distinct builds A/B. Interrupt B's install, disconnect, then reload A: its HTML, JS and CSS load and the saved draft opens.
- [ ] Complete B's install and normal activation; B opens offline. A second same-origin scope keeps its cache, and no update forces a reload during a reply.

### LC-07 — Qualify provider behavior on the stable candidate

M2 · P1 · Provider QA · Depends on: LC-01, LC-02, LC-05, LC-06

Use mock responses in routine CI and opt-in device/service checks outside CI. Record candidate, browser, model, outcome and limitations, not tokens or chat transcripts.

- [ ] For each advertised provider, record catalog and inference results separately; test fixed-prompt streaming, stop, and retry. Include desktop loopback and phone-to-LAN for LM Studio. Mark untested combinations explicitly; obtain consent before any paid call.
- [ ] Fixtures cover rejected credentials, throttling, interruption, and missing usage. Verify failed initial persistence makes zero network requests; retry requires a new user decision.

### LC-08 — Report telemetry for the whole tool-assisted reply

M3 · P1 for tool beta · Telemetry · Depends on: candidate includes tool-turn implementation · Finding 6

In `src/use-workspace.ts` and the response inspector, retain per-round usage and distinguish end-to-end duration from generation time. Do not infer a zero cost from missing usage.

- [ ] Feed two rounds with different usage/cost; verify compatible totals, per-round values and elapsed time including the tool wait. Missing usage marks the total incomplete; cancellation preserves already reported usage.
- [ ] Reload the reply and compare displayed values. Old single-round replies remain readable; stored telemetry is not sent in later requests.

### LC-09 — Qualify opt-in tool execution in the production bundle

M3 · P1 for tool beta · Browser QA · Depends on: LC-02, LC-05, LC-06, LC-08

Extend `tests/tool-execution-smoke.mjs` and `tests/javascript-tools.test.ts`. Verify the actual packaged worker/WASM, not just the request builder.

- [ ] From a Pages subpath, explicitly enable a harmless calculation; see its output and follow-up request. Reload and send a plain message: no tool schema or past execution record is attached.
- [ ] Exercise stop, timeout, bounded output, interrupted reload and unavailable worker. Plain chat still works without the tool; the UI states that results go to the provider and more requests may cost money. If qualification fails, exclude tools from stable.

### LC-10 — Sign off installed mobile and accessible chat journeys

M4 · P1 · Accessibility/device QA · Depends on: LC-05, LC-06

Use the acceptance criteria in `DESIGN/DESIGN.md`. Record device/OS/browser and installed versus browser-tab mode; Chromium emulation is not a substitute for device sign-off.

- [ ] On iOS home-screen and Android installed mode, configure a provider, compose with Chinese IME, attach/remove a file, stop a reply, reopen offline and restore a backup. The keyboard never hides Send and composition does not submit early.
- [ ] In English and Simplified Chinese, verify keyboard-only dialog focus/return, screen-reader status announcements, zoom and reduced motion. Record pass/fail per journey and document unsupported combinations before release.

### LC-11 — Measure startup and checkpoint costs before redesigning storage

M5 · P2 · Performance · Depends on: LC-04, LC-05

Measure `storage.restore` and streamed conversation checkpoints with repeatable synthetic small, long and attachment-heavy histories. Do not use personal chat data.

- [ ] Publish fixture sizes, devices, build SHA, repetitions, startup-to-interactive and checkpoint latency distributions on desktop and phone. Report peak memory where measurable, otherwise mark it unavailable.
- [ ] Name the limiting operation and agree on a budget before proposing lazy history, separate blobs or a schema migration. A no-change decision supported by measurements closes this ticket.

### LC-12 — Separate import and reply orchestration behind tested contracts

M5 · P2 · Maintainability · Depends on: LC-05, LC-07, LC-11

Extract import planning/commit and provider-turn orchestration from `src/use-workspace.ts` in separately reviewable changes. Keep a single workspace projection; this ticket does not authorize a database redesign.

- [ ] Existing restore, failed-save, import, stream/stop and retry fixtures pass without changing the persisted backup format or emitting extra provider requests. Run optional tool tests if those paths are included.
- [ ] Compare startup and checkpoint timings with LC-11 on the same fixtures. Investigate regressions before merging; open a separate migration proposal only if the measurements justify it.
