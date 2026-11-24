import { defaultSettings, providerIds } from "./types";
import type { Attachment, Conversation, Message, Settings } from "./types";

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
): value is { version: number; conversations: Conversation[] } {
  if (!value || typeof value !== "object") return false;
  const data = value as { version?: unknown; conversations?: unknown };
  if (data.version !== 1 || !Array.isArray(data.conversations)) return false;
  return data.conversations.every(
    (c: Conversation) =>
      c &&
      typeof c.id === "string" &&
      typeof c.title === "string" &&
      typeof c.draft === "string" &&
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
