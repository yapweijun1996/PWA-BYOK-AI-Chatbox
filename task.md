# Luma Chat improvement tasks

Tasks 1–5 were committed at `2d73183`; tasks 6 and 7 complete the implementation of this plan. The regression cases for these changes have not been run locally, and CI and deployment status have not been checked.

These tasks are from the source review at `e813fa0`. LM Studio credential binding to the approved server base URL is already implemented; preserve it rather than rebuilding it. See the [feature map](FEATURE-MAP.md) for current behavior and the [issue backlog](docs/ISSUE-BACKLOG.md) for the referenced `LC-*` tickets.

## First changes

- [x] **1. Keep unapproved server addresses out of storage and backups.** Keep the address being edited separate from the saved LM Studio endpoint. Apply it only after validation with `providerBaseUrl`. Export explicitly selected settings fields and omit invalid legacy endpoints with a notice.
  - **Done when:** Cancel leaves the approved destination and credential unchanged. An address containing credentials, a query, or a fragment is neither persisted by the form nor emitted by the backup writer. Valid custom base paths still round-trip.
  - **Start in:** [provider settings UI](src/App.tsx), [settings and export actions](src/use-workspace.ts), [URL validation](src/providers.ts).

- [x] **2. Separate browsing providers from choosing a message recipient.** Give Settings its own selected tab. Change the global provider only through an explicit selection. Before the first send of existing local history to a cloud destination, offer to continue with history or start an empty chat.
  - **Done when:** Viewing another provider's settings and returning to chat does not change where the next message goes. Cancelling a destination change sends nothing; starting fresh sends no previous messages or attachments.
  - **Start in:** [provider tabs](src/App.tsx), [workspace actions](src/use-workspace.ts), [configuration resolution](src/request-config.ts).

- [x] **3. Distinguish a finished operation from a committed save.** Keep streamed text visible immediately, but track the final reply write and the archive write through transaction completion.
  - **Done when:** A delayed write is not presented as saved. If it fails, the reply remains available or the archive action remains recoverable. Retrying the local save does not send a second provider request.
  - **Start in:** `runReply`, `organizeChat` and `queueSave` in [the workspace controller](src/use-workspace.ts); [IndexedDB transactions](src/storage.ts).

## Recovery and offline use

- [x] **4. Make backups restorable (LC-03, LC-05).** Share a serialized-byte limit between import and export; offer smaller exports or explain when a single conversation cannot fit. Validate IDs and attachment metadata, resolve conflicts and preference choices up front, then commit the selected conversations and settings together.
  - **Done when:** Every export offered as restorable fits the importer. A failed import leaves the previous workspace and local vault unchanged. Older v1 backups still load. Import checks records against the preview inside its transaction and assigns new device-local revisions.

- [x] **5. Prevent stale writes across tabs (LC-04).** Check the expected conversation revision in the write transaction. Apply settings changes without replacing unrelated fields from a stale snapshot.
  - **Done when:** A stale tab cannot silently overwrite newer messages or recreate a deleted chat. Its unsaved draft can be kept as a copy. Changing a theme cannot restore an old provider configuration.

- [x] **6. Keep the offline shell paired with its assets (LC-06).** Treat each installed HTML shell and its precached assets as one version. Limit cache cleanup to the service worker's own registration scope.
  - **Done when:** An interrupted update leaves the previously installed build usable offline. Updating one Pages subpath does not delete another's cache or force a reload during a reply.
  - **Coverage written (not run):** the [update harness](tests/update-smoke.mjs) serves the production output as A and distinct HTML/JS/CSS as fixture B. It exercises wrong bytes, a disconnected install, natural activation, draft recovery and an independent same-origin registration.

- [x] **7. Clear transient state when clearing local data.** Reset credential and password inputs and dismiss any import preview. Ignore completions from unlock or import operations started before the clear.
  - **Done when:** After clearing, returning to Settings shows no previous credential input or pending import. A late operation cannot unlock a key or repopulate cleared chats.
  - **Coverage written (not run):** [clear-data browser cases](tests/clear-data.mjs) hold crypto results, a backup read, a mocked catalog and the real deletion transaction. They cover cancel, rollback, successful reset and a fresh explicit import.

Keep direct browser-to-provider requests, per-conversation drafts, and v1 backup compatibility throughout. A chat backup contains private content; it is not a shareable diagnostic export.
