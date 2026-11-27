# Long conversation performance and virtualization design

## Baseline: first conversation load

Measured on 2026-11-27 with headless Chromium 156.0.8078.79, Node 24.22.3, a 1280×800 viewport, and an AMD EPYC 9V74 environment exposing five CPUs. The production build was served from localhost. The app shell was warm, IndexedDB was preseeded, and service workers were blocked to isolate the load from worker installation and network variability. This is not a cold-network or mobile-device measurement.

Each message contained two short paragraphs, a bold span, a link and inline KaTeX. Conversations alternated user and assistant messages. Three reloads were measured per size. `interactive` is the app's `luma:startup:interactive` performance measure from navigation start through startup reveal; all messages were verified present. DOM counts cover descendants of `.messages` and include KaTeX markup.

| Messages | Interactive samples (ms) | Median (ms) | Message DOM descendants |
| ---: | --- | ---: | ---: |
| 250 | 1301, 1139, 1283 | 1283 | 22,250 |
| 500 | 1479, 1989, 1557 | 1557 | 44,500 |
| 1000 | 3369, 2736, 3113 | 3113 | 89,000 |
| 2000 | 7126, 6196, 5628 | 6196 | 178,000 |

The sample is intentionally Markdown- and math-heavy; other content, devices, fonts and caches will differ. Measurements are observations, not performance budgets. Reproduce against a built app with `npm run build`, start `npm run preview -- --port 55167`, and run `node scripts/benchmark-long-conversation.mjs`. Set `MESSAGE_COUNTS`, `REPETITIONS` or `TEST_BASE_URL` to change the run. The script creates an isolated browser context and seeds a synthetic conversation.

The default implementation memoizes active paths and message rows but mounts the whole active path. It improves draft and streaming updates; it does not cap initial Markdown parsing, layout cost, or DOM size. For a single long streaming response, display updates after 8,192 characters are coalesced to at most one per 120 ms while data continues to accumulate and persist normally. Terminal states display their full raw source immediately. A local 24-chunk/18 ms experiment produced 24 Markdown DOM update batches before coalescing and 4 afterward; these values depend on scheduling and are not a device-independent speedup.

## Phase-one prototype

The experimental setting is in **Settings → Appearance**, off by default and limited to the current tab (including reloads). It activates at 200 messages. The full conversation remains the source of truth; only a window and height spacers are mounted. The prototype measures mounted rows, overscans two screens and maintains a visible-message anchor as rows or viewport dimensions change. Offscreen heights from an earlier width or font remain estimates until remeasured.

Code, attachments, reasoning, images and completed tool cards may now appear in the virtual window. Starting a reply still disables the experiment. Searching temporarily mounts the full active path so existing branch-aware search can locate and focus a result; windowing resumes after the highlight expires. This is a correctness-first fallback, not fully virtualized search, and can be expensive in very large chats. Selecting text or interacting with a message pauses windowing until **Resume virtual mode (closes open previews)** is selected, keeping open tool details and preview processes mounted in the meantime. Resuming can close an offscreen preview. The **Copy conversation** action copies the raw message text of the complete active branch, excluding hidden branches, without mounting every row. Cross-screen drag selection instead uses the temporary full list. Browser Find and screen-reader traversal still require **Show full conversation**. Real mobile and assistive-technology validation remains outstanding; this is not a default-on implementation.

A local comparison used the same synthetic fixture and environment described above, with separate three-reload runs for each mode. The virtual run pre-enabled the per-tab switch; the full run used the default. Measurements are illustrative, not release budgets:

| Messages | Full median interactive (ms) | Prototype median interactive (ms) | Full / prototype DOM descendants |
| ---: | ---: | ---: | ---: |
| 500 | 1,935 | 329 | 44,502 / 661 |
| 1,000 | 2,905 | 312 | 89,002 / 661 |
| 2,000 | 5,697 | 312 | 178,002 / 661 |

The prototype measurements were taken near the end of the synthetic conversation after two animation frames; mounted counts and timings vary with content and viewport. Run `VIRTUAL=1 node scripts/benchmark-long-conversation.mjs` for the opt-in case. The comparison does not establish performance on real phones or for conversations that deliberately fall back to full mode.

## Later virtualization work (design only)

**Goal:** bound mounted message DOM for large active branches while retaining branch isolation, reliable scroll anchoring and explicit access to every message. Do not change the persisted conversation schema or provider request history.

- **Model and indexing.** Build the virtual list from the full ordered active-path message IDs. Search the full persisted text and branch graph, including existing hidden-branch rules; do not search only mounted nodes. Map result IDs to active-path indices after branch activation. Keep exports, provider history, metrics and deletion based on the full model, never the visible window.
- **Window and size estimates.** Enable only above a measured threshold, with overscan above and below the viewport. Use stable message IDs and a height cache keyed by message ID plus width, theme, font settings and relevant expansion state. Measure actual mounted heights with `ResizeObserver`; invalidate estimates on width, locale, font, image, tool, math or expansion changes. Retain the streaming message and its nearby context. Use bounded caches and a fallback estimate for unseen messages.
- **Anchoring and following.** Preserve the first visible message ID and its pixel offset when estimates or heights change. At the bottom, keep the existing follow behavior; when reading earlier content, do not jump as new tokens arrive. Restore anchors after branch switches, device rotation and viewport changes. Avoid synthetic scroll events being mistaken for user intent, and test repeated fast scrolls, font loading and oversized messages.
- **Search and focus.** For an in-app search result, activate the appropriate branch, resolve its ID to an index, mount the range, wait for layout, adjust the anchor, then focus and highlight the actual message. Cancel stale requests on navigation or a newer search. Native browser Find cannot discover unmounted text: provide a clearly labeled full-conversation mode or use in-app search; do not claim native Find searches unloaded messages. Screen-reader traversal likewise needs an accessible full-content mode or an equivalent tested navigation mechanism.
- **Copy and selection.** Partial text selection inside a mounted message remains native. A drag selection cannot span nodes that are not mounted; offer an explicit full-conversation selection mode that mounts the active path, and retain the existing raw-Markdown mapping for selections across bubbles. Provide separate copy-message and copy-conversation actions backed by the active-path model. Do not silently truncate a selection or include hidden branches. Explain the memory cost of full-content mode.
- **Interactive state and lifecycle.** Store reasoning/tool expansion, code wrap, preview settings and other user-visible state outside disposable rows or pin affected rows. Never silently restart an interactive preview or terminate a running worker because its row leaves the viewport. Close, stop and navigation semantics must remain explicit. Downloads and streaming execution retain their current security boundaries.
- **Cross-tab and failures.** Invalidate indices and measurements on committed external changes, conflict resolution, imports, deletion and branch changes. Recover gracefully if a requested message disappears. Avoid persisting virtualization state in backups or treating viewport data as conversation content.
- **Rollout and verification.** Prototype behind an opt-in setting, compare cold and warm initial loads, interaction latency, DOM count and memory at 250/500/1000+ messages on desktop and real mobile devices. Test keyboard, screen readers, reduced motion, browser Find/full-content mode, long and short messages, images, code preview, tool execution, branch search, cross-message copy and anchor restoration. Establish budgets and regression thresholds from repeated device measurements before enabling by default. Provide a full-render fallback for unsupported environments or failed measurements.
