import { defaultSettings, providerIds } from "./types";
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

export function mergeSettings(input: Partial<Settings> | undefined): Settings {
  const provider =
    input?.provider && providerIds.includes(input.provider)
      ? input.provider
      : defaultSettings.provider;
  const theme =
    input?.theme && ["light", "dark", "system"].includes(input.theme)
      ? input.theme
      : defaultSettings.theme;
  const configs = { ...defaultSettings.providers };
  for (const providerId of providerIds) {
    const saved = input?.providers?.[providerId];
    configs[providerId] = {
      ...defaultSettings.providers[providerId],
      model: typeof saved?.model === "string" ? saved.model : "",
      vision: saved?.vision === true,
      reasoningSupported: saved?.reasoningSupported === true,
      requestThoughts: saved?.requestThoughts === true,
      endpoint:
        providerId === "lmstudio" && typeof saved?.endpoint === "string"
          ? saved.endpoint
          : defaultSettings.providers[providerId].endpoint,
    };
  }
  return {
    provider,
    theme,
    sidebarCollapsed: input?.sidebarCollapsed === true,
    sidebarWidth: normalizeSidebarWidth(input?.sidebarWidth),
    projects: mergeProjects(
      [],
      Array.isArray(input?.projects) ? input.projects.filter(validProject) : [],
    ),
    language:
      input?.language && ["system", "en", "zh-CN"].includes(input.language)
        ? input.language
        : "system",
    providers: configs,
    vaults:
      input?.vaults && typeof input.vaults === "object" ? input.vaults : {},
  };
}
function validAttachment(a: Attachment): boolean {
  return (
    !!a &&
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    typeof a.mime === "string" &&
    typeof a.data === "string" &&
    Number.isFinite(a.size) &&
    (a.mime.startsWith("text/") ||
      (a.mime.startsWith("image/") &&
        /^data:image\/(png|jpeg|gif|webp);base64,/i.test(a.data)))
  );
}
export function validBackup(
  value: unknown,
): value is {
  version: number;
  conversations: Conversation[];
  projects?: WorkspaceProject[];
  settings?: Partial<Settings>;
} {
  if (!value || typeof value !== "object") return false;
  const data = value as {
    version?: unknown;
    conversations?: unknown;
    projects?: unknown;
  };
  if (
    data.version !== 1 ||
    !Array.isArray(data.conversations) ||
    (data.projects !== undefined &&
      (!Array.isArray(data.projects) || !data.projects.every(validProject)))
  )
    return false;
  return data.conversations.every(
    (c: Conversation) =>
      c &&
      typeof c.id === "string" &&
      typeof c.title === "string" &&
      typeof c.draft === "string" &&
      (c.pinned === undefined || typeof c.pinned === "boolean") &&
      (c.archived === undefined || typeof c.archived === "boolean") &&
      (c.projectId === undefined ||
        (typeof c.projectId === "string" &&
          c.projectId.length > 0 &&
          c.projectId.length <= 160)) &&
      (c.draftAttachments === undefined ||
        (Array.isArray(c.draftAttachments) &&
          c.draftAttachments.every(validAttachment))) &&
      Number.isFinite(c.updatedAt) &&
      Array.isArray(c.messages) &&
      c.messages.every((m: Message) => {
        if (
          !m ||
          typeof m.id !== "string" ||
          !["user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" ||
          (m.reasoning !== undefined && typeof m.reasoning !== "string") ||
          (m.telemetry !== undefined && !validResponseTelemetry(m.telemetry)) ||
          !Number.isFinite(m.createdAt)
        )
          return false;
        return (
          !m.attachments ||
          (Array.isArray(m.attachments) && m.attachments.every(validAttachment))
        );
      }),
  );
}
