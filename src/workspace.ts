import type { Conversation, WorkspaceProject } from "./types";
import type { Message } from "./types";

export const sidebarWidth = { min: 224, default: 264, max: 440 } as const;
export const projectNameLimit = 80;
export const chatTitleLimit = 160;

export function groupRecentByDate(chats: Conversation[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const result: Record<
    "Future" | "Today" | "Previous 7 days" | "Earlier",
    Conversation[]
  > = {
    Future: [],
    Today: [],
    "Previous 7 days": [],
    Earlier: [],
  };
  for (const chat of chats) {
    const timestamp = chat.updatedAt;
    const group = !Number.isFinite(timestamp)
      ? "Earlier"
      : timestamp >= tomorrow.getTime()
        ? "Future"
        : timestamp >= today.getTime()
          ? "Today"
          : timestamp >= week.getTime()
            ? "Previous 7 days"
            : "Earlier";
    result[group].push(chat);
  }
  return result;
}

export function normalizeSidebarWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(sidebarWidth.min, Math.min(sidebarWidth.max, Math.round(value)))
    : sidebarWidth.default;
}

export function validProject(value: unknown): value is WorkspaceProject {
  if (!value || typeof value !== "object") return false;
  const { id, name } = value as Partial<WorkspaceProject>;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 160 &&
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.length <= projectNameLimit
  );
}

export function mergeProjects(
  existing: WorkspaceProject[],
  imported: WorkspaceProject[],
): WorkspaceProject[] {
  const projects = new Map(existing.map((project) => [project.id, project]));
  for (const project of imported) {
    if (!projects.has(project.id))
      projects.set(project.id, { ...project, name: project.name.trim() });
  }
  return [...projects.values()];
}

export function groupConversations(
  chats: Conversation[],
  projects: WorkspaceProject[],
) {
  const pinned: Conversation[] = [];
  const recent: Conversation[] = [];
  const counts = new Map<string, number>();
  const folders = new Map(projects.map(({ id }) => [id, [] as Conversation[]]));
  for (const chat of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const folder = chat.projectId && folders.get(chat.projectId);
    if (chat.projectId && folder)
      counts.set(chat.projectId, (counts.get(chat.projectId) || 0) + 1);
    if (chat.archived) continue;
    if (chat.pinned) pinned.push(chat);
    else if (folder) folder.push(chat);
    else recent.push(chat);
  }
  return { pinned, recent, folders, counts };
}

export function searchConversations(
  chats: Conversation[],
  query: string,
  archived: boolean,
  projects: WorkspaceProject[],
) {
  const needle = query.trim().toLowerCase();
  const names = new Map(
    projects.map(({ id, name }) => [id, name.toLowerCase()]),
  );
  return chats
    .filter(
      (chat) =>
        Boolean(chat.archived) === archived &&
        (!needle ||
          chat.title.toLowerCase().includes(needle) ||
          (chat.projectId && names.get(chat.projectId)?.includes(needle)) ||
          chat.messages.some(({ content }) =>
            content.toLowerCase().includes(needle),
          )),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type WorkspaceSearchResult = {
  chat: Conversation;
  message?: Message;
  snippet?: string;
};
export function searchWorkspace(
  chats: Conversation[],
  query: string,
  archived: boolean,
  projects: WorkspaceProject[],
  maxResults = Number.POSITIVE_INFINITY,
): WorkspaceSearchResult[] {
  if (maxResults <= 0) return [];
  const needle = query.trim().toLowerCase();
  const names = new Map(
    projects.map((project) => [project.id, project.name.toLowerCase()]),
  );
  const result: WorkspaceSearchResult[] = [];
  for (const chat of [...chats]
    .filter((item) => Boolean(item.archived) === archived)
    .sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (
      !needle ||
      chat.title.toLowerCase().includes(needle) ||
      Boolean(chat.projectId && names.get(chat.projectId)?.includes(needle))
    ) {
      result.push({ chat });
      if (result.length >= maxResults) return result;
    }
    if (!needle) continue;
    for (const message of chat.messages) {
      const index = message.content.toLowerCase().indexOf(needle);
      if (index < 0) continue;
      const start = Math.max(0, index - 40);
      const end = Math.min(
        message.content.length,
        start + 160,
        Math.max(index + needle.length, start + 120),
      );
      result.push({
        chat,
        message,
        snippet: `${start ? "…" : ""}${message.content.slice(start, end).replace(/\s+/g, " ")}${end < message.content.length ? "…" : ""}`,
      });
      if (result.length >= maxResults) return result;
    }
  }
  return result;
}

export function mostRecentVisible(
  chats: Conversation[],
  excluding?: string,
): string {
  let latest: Conversation | undefined;
  for (const chat of chats) {
    if (
      !chat.archived &&
      chat.id !== excluding &&
      (!latest || chat.updatedAt > latest.updatedAt)
    )
      latest = chat;
  }
  return latest?.id ?? "";
}
