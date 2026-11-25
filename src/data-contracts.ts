import { defaultSettings, providerIds } from "./types";
import { attachmentByteLimit } from "./attachments";
import { checkedLmStudioAddress } from "./credential-destination";
import type {
  Attachment,
  Conversation,
  Message,
  Settings,
  WorkspaceProject,
} from "./types";
import {
  mergeProjects,
  normalizeSidebarWidth,
  validProject,
} from "./workspace";
import { validResponseTelemetry } from "./response-telemetry";
import { validOverrides, validRequestSnapshot } from "./request-config";
import { restoreToolExecutions, validToolExecutions } from "./javascript-tool";
import { validResponsesReplay } from "./openai-responses";
import { validBranchConversation } from "./branches";

export function recoverMessage(message: Message): Message {
  if (
    message.status !== "streaming" &&
    !message.toolExecutions?.some(({ result }) => !result)
  )
    return message;
  return {
    ...message,
    status: message.status === "streaming" ? "interrupted" : message.status,
    ...(message.toolExecutions
      ? { toolExecutions: restoreToolExecutions(message.toolExecutions) }
      : {}),
  };
}

export function mergeSettings(
  input: Partial<Settings> | undefined,
  retainedLmStudioEndpoint?: string,
): Settings {
  const provider =
    input?.provider && providerIds.includes(input.provider)
      ? input.provider
      : defaultSettings.provider;
  const theme =
    input?.theme && ["light", "dark", "system"].includes(input.theme)
      ? input.theme
      : defaultSettings.theme;
  const supplied = input?.providers?.lmstudio?.endpoint;
  // Import keeps the current destination; restore must not silently redirect an invalid legacy URL.
  const fallback =
    retainedLmStudioEndpoint !== undefined
      ? (checkedLmStudioAddress(retainedLmStudioEndpoint) ?? "")
      : supplied === undefined
        ? defaultSettings.providers.lmstudio.endpoint
        : "";
  const lmStudioEndpoint = checkedLmStudioAddress(supplied) ?? fallback;
  const configs = { ...defaultSettings.providers };
  for (const providerId of providerIds) {
    const saved = input?.providers?.[providerId];
    configs[providerId] = {
      ...defaultSettings.providers[providerId],
      model: typeof saved?.model === "string" ? saved.model : "",
      vision: saved?.vision === true,
      reasoningSupported: saved?.reasoningSupported === true,
      requestThoughts: saved?.requestThoughts === true,
      ...(providerId === "openai" && saved?.openaiApi === "responses" ? { openaiApi: "responses" as const } : {}),
      endpoint:
        providerId === "lmstudio"
          ? lmStudioEndpoint
          : defaultSettings.providers[providerId].endpoint,
    };
  }
  return {
    provider,
    theme,
    localToolsEnabled: input?.localToolsEnabled !== false,
    sidebarCollapsed: input?.sidebarCollapsed === true,
    sidebarWidth: normalizeSidebarWidth(input?.sidebarWidth),
    projects: mergeProjects(
      [],
      Array.isArray(input?.projects) ? input.projects.filter(validProject) : [],
    ),
    language:
      input?.language && ["system", "en", "zh-CN", "ms"].includes(input.language)
        ? input.language
        : "system",
    providers: configs,
    vaults:
      input?.vaults && typeof input.vaults === "object" ? input.vaults : {},
  };
}
// A v1 backup is portable preferences, not a copy of the settings store.
export function backupPreferences(settings: Settings) {
  const localAddress = checkedLmStudioAddress(
    settings.providers.lmstudio.endpoint,
  );
  const providers = Object.fromEntries(
    providerIds.map((id) => {
      const { model, vision, reasoningSupported, requestThoughts, openaiApi } =
        settings.providers[id];
      const endpoint =
        id === "lmstudio"
          ? localAddress
          : defaultSettings.providers[id].endpoint;
      return [
        id,
        {
          id,
          model,
          vision,
          reasoningSupported,
          requestThoughts,
          ...(id === "openai" && openaiApi === "responses" ? { openaiApi } : {}),
          ...(endpoint !== undefined ? { endpoint } : {}),
        },
      ] as const;
    }),
  );
  return {
    preferences: {
      provider: settings.provider,
      theme: settings.theme,
      language: settings.language,
      localToolsEnabled: settings.localToolsEnabled,
      sidebarWidth: settings.sidebarWidth,
      sidebarCollapsed: settings.sidebarCollapsed,
      providers,
    },
    omittedServerAddress: localAddress === undefined,
  };
}

function uniqueIds(items: { id: string }[]): boolean {
  const seen = new Set<string>();
  return items.every((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      seen.has(item.id)
    )
      return false;
    seen.add(item.id);
    return true;
  });
}

function validAttachment(a: Attachment): boolean {
  if (
    !a ||
    typeof a.name !== "string" ||
    typeof a.mime !== "string" ||
    typeof a.data !== "string" ||
    !Number.isSafeInteger(a.size) ||
    a.size < 0 ||
    a.size > attachmentByteLimit
  )
    return false;
  // Text size describes the original File, before BOM removal or decoding replacements.
  if (/^text\/[^\s/;]+(?:\s*;[^\r\n]*)?$/i.test(a.mime)) {
    if (a.data.length > a.size) return false;
    const utf8Bytes = new Blob([a.data]).size;
    return a.size === utf8Bytes || a.size === utf8Bytes + 3 ||
      (a.data.includes("\uFFFD") && a.size <= utf8Bytes + 3);
  }
  if (!/^image\/(png|jpeg|gif|webp)$/i.test(a.mime)) return false;
  const prefix = `data:${a.mime.toLowerCase()};base64,`;
  if (a.data.slice(0, prefix.length).toLowerCase() !== prefix) return false;
  const payload = a.data.slice(prefix.length);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return (
    a.size > 0 &&
    payload.length === 4 * Math.ceil(a.size / 3) &&
    a.size === 3 * (payload.length / 4) - padding &&
    !/[^A-Za-z0-9+/]/.test(payload.slice(0, payload.length - padding))
  );
}

const validAttachments = (items: Attachment[]) =>
  Array.isArray(items) && uniqueIds(items) && items.every(validAttachment);

export type Backup = {
  version: 1 | 2;
  conversations: Conversation[];
  projects?: WorkspaceProject[];
  settings?: Partial<Settings>;
};
export function validBackup(value: unknown): value is Backup {
  if (!value || typeof value !== "object") return false;
  const data = value as {
    version?: unknown;
    conversations?: unknown;
    projects?: unknown;
    settings?: unknown;
  };
  if (
    (data.version !== 1 && data.version !== 2) ||
    !Array.isArray(data.conversations) ||
    !uniqueIds(data.conversations) ||
    (data.settings !== undefined &&
      (!data.settings ||
        typeof data.settings !== "object" ||
        Array.isArray(data.settings))) ||
    (data.projects !== undefined &&
      (!Array.isArray(data.projects) ||
        !uniqueIds(data.projects) ||
        !data.projects.every(validProject)))
  )
    return false;
  return data.conversations.every(
    (c: Conversation) =>
      c &&
      (data.version !== 1 || c.branchVersion === undefined) &&
      typeof c.id === "string" &&
      typeof c.title === "string" &&
      typeof c.draft === "string" &&
      (c.configOverride === undefined || validOverrides(c.configOverride)) &&
      (c.pinned === undefined || typeof c.pinned === "boolean") &&
      (c.archived === undefined || typeof c.archived === "boolean") &&
      (c.projectId === undefined ||
        (typeof c.projectId === "string" &&
          c.projectId.length > 0 &&
          c.projectId.length <= 160)) &&
      (c.draftAttachments === undefined ||
        validAttachments(c.draftAttachments)) &&
      (c.editState === undefined || (
        typeof c.editState === "object" && c.editState !== null &&
        typeof c.editState.sourceId === "string" && c.editState.sourceId.length > 0 && c.editState.sourceId.length <= 160 &&
        typeof c.editState.originalDraft === "string" && validAttachments(c.editState.originalAttachments)
      )) &&
      Number.isFinite(c.updatedAt) &&
      Array.isArray(c.messages) &&
      uniqueIds(c.messages) &&
      validBranchConversation(c) &&
      c.messages.every((m: Message) => {
        if (
          !m ||
          typeof m.id !== "string" ||
          !["user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" ||
          (m.status !== undefined &&
            !["complete", "interrupted", "streaming", "error"].includes(
              m.status,
            )) ||
          (m.reasoning !== undefined && typeof m.reasoning !== "string") ||
          (m.error !== undefined && typeof m.error !== "string") ||
          (m.telemetry !== undefined && !validResponseTelemetry(m.telemetry)) ||
          (m.responsesReplay !== undefined && (m.role !== "assistant" || !validResponsesReplay(m.responsesReplay))) ||
          (m.toolExecutions !== undefined &&
            (m.role !== "assistant" ||
              !validToolExecutions(m.toolExecutions))) ||
          (m.request !== undefined &&
            (m.role !== "assistant" || !validRequestSnapshot(m.request))) ||
          !Number.isFinite(m.createdAt)
        )
          return false;
        return m.attachments === undefined || validAttachments(m.attachments);
      }),
  );
}
