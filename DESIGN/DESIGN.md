# PWA BYOK AI Chatbox — UI/UX Design

**Status:** Design proposal

**Working product name:** Luma Chat (placeholder)

**Design direction:** A calm, local-first AI chat workspace inspired by the clarity of ChatGPT and Claude. The four generated images are visual anchors; this document defines the expected behavior and resolves any differences in the images.

## 1. Product goal

Let people open an installable web app, connect their own AI provider, and chat in a familiar interface. Conversations and settings are stored in IndexedDB on the current device. The user decides whether to retain an API key. Cloud providers receive the content sent to them; local-first storage does not make cloud AI private or offline.

## 2. Four visual anchors

1. **Desktop chat:** Persistent conversation sidebar, focused reading area, model selector and composer.
2. **Mobile chat:** The same chat experience adapted to a narrow screen, with a sidebar drawer and accessible sticky composer.
3. **Provider settings:** Connect, test and manage providers, models and API-key storage preferences.
4. **Local data:** Explain storage usage and give clear export, import and deletion controls.

Images communicate style, density and layout. Actual features, labels and behavior follow this document.

## 3. Design principles

- Put the conversation first; keep controls discoverable without crowding the reading area.
- Make local storage, the selected provider and network needs understandable.
- Use familiar controls, readable type, sufficient contrast and comfortable touch targets.
- Preserve work across refreshes and make failures recoverable.
- Support desktop, tablet and mobile from the beginning, with light and dark themes.

## 4. Information architecture

| Destination | Purpose |
| --- | --- |
| Chat | Read and continue the active conversation. |
| Conversation sidebar | New chat, search, grouped history, rename and delete. |
| Providers | Configure providers, models, API keys and connection checks. |
| Local data | Inspect storage, export/import and delete user data. |
| Appearance | Light, dark and system theme. |

Settings may be implemented as a dedicated responsive view or dialog; on mobile it occupies the full screen. The composer remains the primary action in Chat.

## 5. Desktop layout

At approximately 1440 × 900:

- **Sidebar:** approximately 248–280 px wide; brand, New chat, search, recent conversations, settings and local-data access. Collapsible without deleting data.
- **Chat header:** current conversation title, selected provider/model, connection or generation status, and an overflow menu for secondary actions.
- **Conversation:** centered reading column, approximately 720–800 px maximum, with enough room for code, lists and tables. User and assistant messages are visually distinct; keep message text selectable.
- **Composer:** anchored near the bottom of the chat area. Multiline text input, attachment control, provider/model selector and send/stop control. Support sensible auto-growing with a maximum height and internal scrolling.
- **First use:** an uncluttered welcome state explains that a provider must be connected, with a clear button to open provider settings. Do not imply AI is ready until configured.

## 6. Responsive behavior

| Viewport | Layout |
| --- | --- |
| Desktop, approximately 1024 px and wider | Sidebar and chat visible together; sidebar can collapse. |
| Tablet, approximately 768–1023 px | Sidebar collapses into a drawer when space is constrained; preserve readable message width. |
| Mobile, below approximately 768 px | One-column chat; history/settings in a drawer or dedicated full-screen view; composer stays accessible above the keyboard and safe area. |

Breakpoints are starting guidance; verify content and controls at real widths rather than relying on fixed device labels. Avoid horizontal page scrolling. Wide tables and code blocks may scroll within their own containers.

## 7. Chat interactions

- New chat opens an empty conversation without losing the current one. Generate a useful title after the first exchange when possible; allow manual rename.
- The user can choose the provider and model; show which are active before sending. Switching models does not silently rewrite existing messages.
- Send with a visible button and an accessible keyboard shortcut. Preserve a newline option; do not interfere with input method composition.
- Stream the response when the provider supports it. Show a stop action while generating. Preserve clearly marked partial output if stopped or interrupted.
- Provide copy, retry and message actions where appropriate. Retry must make any new API request and possible cost clear; don't silently duplicate requests.
- Attachment controls are shown only for supported workflows. Indicate selected files, size and upload progress, and provide removal before sending. Inform the user that submitted attachments are sent to the selected provider.
- Markdown and code should be readable and safe; support tables and math where available. Do not render untrusted content as executable markup.
- Clear errors: missing key, unsupported model, network failure, invalid key, rate limit and insufficient quota. Preserve the unsent draft and offer a suitable next step.

## 8. Conversation sidebar

- New chat, search, recent conversation groups, active conversation highlight, settings and local-data access.
- Search locally stored titles and message content when supported; show a helpful empty state.
- Rename and delete are reachable by keyboard and touch. Confirm deletion, including any associated stored attachments; do not promise recovery unless provided.
- On mobile, a menu button opens the sidebar drawer, and selecting a chat returns to the conversation.

## 9. Provider and key settings

Provider cards support Gemini, OpenAI and LM Studio. LM Studio uses its OpenAI-compatible endpoint with a configurable base URL and optional authentication. All provider requests connect directly from the browser; this version does not provide a proxy. Browser CORS, local-network permissions and mixed-content restrictions can prevent a connection, especially when a phone connects to a computer on the LAN. Explain that localhost on a phone refers to the phone, and recommend authentication and a trusted connection when exposing a local server.

Each provider configuration includes:

- Provider name, endpoint when applicable, available model selection and a custom model option when supported.
- Masked API key field with an explicit show/hide control. Never display a real key in logs or status messages.
- **Test connection** with clear testing, success and failure states. Explain if a test sends a request or may consume quota.
- A choice between **Ask every time** and **Save encrypted on this device**. Saved-key mode requires a user-provided unlock password; explain loss of that password prevents decryption. Do not store the unlock password with the encrypted key.
- Clearly state that encryption reduces exposure of stored keys but cannot protect against malicious scripts running in the app or a compromised device. Lock/unlock and delete-key actions must be easy to find.
- A clear selected-provider state; switching or deleting a provider must not delete conversations without separate confirmation.

Default recommendation: ask every time until the user explicitly opts to save a key. No unencrypted key in backups or diagnostic exports. Avoid exposing keys in URLs.

## 10. Local data and IndexedDB

Store conversations, individual messages, drafts, app preferences and user-selected retained attachments in IndexedDB. Store encrypted credentials only if the user opts in. Keep large attachments distinct from message text so they can be managed and removed intentionally.

The Local data view should provide:

- Estimated used/available storage when the browser exposes it, with an **Unavailable** state when it does not. Treat estimates as estimates, not guaranteed capacity.
- Separate counts or sizes for conversations and attachments where measurable.
- Export and import of conversations, settings and retained attachments. Preview what will be imported, detect conflicts and request a choice before overwriting existing data.
- Credentials are excluded from backups, including encrypted credentials.
- Delete selected conversations and their associated retained attachments after confirmation. Include a separate, clearly labeled action for clearing all local app data.
- Storage-full, blocked, migration and failed-write states that preserve the user's visible work where possible and suggest freeing space or exporting data.

Browser data can be evicted or deleted; request persistent storage where supported and communicate the actual result. Remind users to maintain backups. Data is specific to the browser/app storage context and does not automatically sync between devices. A service worker can cache the app shell separately from IndexedDB; exact offline availability depends on what was cached and on browser behavior.

## 11. Offline and recovery

- Provide a meaningful status: **Offline**, **Connecting**, **Connected** or **Connection failed** where supported. A browser network indicator is not proof that an AI provider is reachable.
- Let users browse already stored conversations and draft messages offline. Cloud AI requests require a connection; local-model availability is a separate configuration.
- If the app was not cached or storage is unavailable, explain what is unavailable and how to recover.
- After refresh or a crash, restore saved conversations and drafts. Mark an interrupted response as incomplete; do not automatically resubmit a paid request.

## 12. Visual system

### Light theme

| Token | Value | Role |
| --- | --- | --- |
| Background | `#F7F7F5` | Overall canvas |
| Surface | `#FFFFFF` | Panels, composer, dialogs |
| Primary text | `#202124` | Headings and body text |
| Secondary text | `#5F6368` | Metadata and hints |
| Border | `#E4E5E8` | Dividers and field outlines |
| Accent | `#625BEF` | Primary actions and selected indicators |

### Dark theme

| Token | Value | Role |
| --- | --- | --- |
| Background | `#17181B` | Overall canvas |
| Surface | `#232428` | Panels and inputs |
| Primary text | `#F4F4F5` | Headings and body text |
| Secondary text | `#B7B8BE` | Metadata and hints |
| Border | `#3A3B42` | Dividers and outlines |
| Accent | `#AAA5FF` | Selection and interactive emphasis |

Use a legible system sans-serif stack or Inter when available. Suggested type sizes: 14–16 px for interface and body, 20–24 px for page titles. Use an 8 px spacing rhythm; rounded surfaces around 12–16 px; restrained shadows and simple outlined icons. Accent-colored primary buttons need contrast-tested foregrounds; use a darker accent variant if necessary. Honor reduced-motion preferences.

## 13. Accessibility

- Keyboard access, visible focus, logical tab order and correct accessible names for icon-only controls.
- Minimum 44 × 44 CSS px touch targets where practical; sufficient text and control contrast.
- Programmatic labels for inputs; announce status and error changes without repeatedly reading every streamed token.
- Respect browser zoom, dynamic text sizes, reduced motion and system color preferences.
- Never communicate errors, selected states or connection status with color alone.

## 14. Core states to design and verify

1. First launch, no provider configured.
2. Provider configured, key locked or missing.
3. Ready to chat; empty history and existing history.
4. Generating, stopped, interrupted and completed response.
5. No internet, failed provider request, rate limit and quota error.
6. Attachment selected, upload failed and unsupported file type.
7. Storage usage unknown, storage full and write failure.
8. Export success, import preview/conflict and confirmed deletion.
9. Light/dark, desktop/tablet/mobile, keyboard and screen-reader use.

## 15. Acceptance criteria

- A user can identify the active provider/model, start a chat and locate settings without instruction.
- Conversation history and saved drafts return after refresh on the same supported browser/storage context.
- On desktop, the sidebar, conversation and composer remain usable at common window sizes; on mobile, no control is hidden by the keyboard or safe area.
- Users can connect a supported provider, understand how the key is stored, and remove it; key material is never shown in logs or default exports.
- Offline viewing is clearly distinguished from generating with a cloud model.
- Users can export, preview/import and deliberately delete local data, with understandable failure states.
- Core workflows are accessible by keyboard and usable in light and dark themes.

## 16. Scope notes

This is a design specification, not a claim that an application has been built. Provider availability, capabilities, browser storage limits, direct browser connectivity, and desktop and phone LM Studio access must be verified on actual target devices. Multi-device sync and server-side accounts are not assumed; they require a separate product and security decision.
