export type ProviderId = "gemini" | "openai" | "anthropic" | "openrouter" | "lmstudio";
import type { Language } from "./i18n";
import type { RequestOverrides, RequestSnapshot } from "./request-config";
import type { ResponseTelemetry } from "./response-telemetry";
import type { ToolExecution } from "./javascript-tool";
import { sidebarWidth } from "./workspace";
export const providerIds: ProviderId[] = [
  "gemini",
  "openai",
  "anthropic",
  "openrouter",
  "lmstudio",
];
export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  data: string;
};
export type Message = {
  id: string;
  parentId?: string | null;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  createdAt: number;
  status?: "complete" | "streaming" | "interrupted" | "error";
  error?: string;
  attachments?: Attachment[];
  telemetry?: ResponseTelemetry;
  request?: RequestSnapshot;
  toolExecutions?: ToolExecution[];
  responsesReplay?: import("./openai-responses").ResponsesReplay;
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  branchVersion?: 1;
  activeMessageId?: string | null;
  preferredBranches?: Record<string, string>;
  draft: string;
  draftAttachments?: Attachment[];
  editState?: { sourceId: string; originalDraft: string; originalAttachments: Attachment[] };
  pinned?: boolean;
  archived?: boolean;
  projectId?: string;
  configOverride?: RequestOverrides;
  // Device-local consent for replaying this chat; never portable via backups.
  cloudHistoryRecipient?: Exclude<ProviderId, "lmstudio">;
  cloudHistoryKnownIds?: string[];
};
export type WorkspaceProject = { id: string; name: string };
export type ProviderConfig = {
  id: ProviderId;
  model: string;
  endpoint: string;
  vision: boolean;
  reasoningSupported?: boolean;
  requestThoughts?: boolean;
  openaiApi?: "chat_completions" | "responses";
  reasoningEffort?: import("./reasoning-effort").ReasoningEffort;
  reasoningEfforts?: Record<string, import("./reasoning-effort").ReasoningEffort>;
};
export type Cipher = {
  destination?: string; // LM Studio only; older vaults require explicit binding on unlock.
  version: 1;
  salt: string;
  iv: string;
  data: string;
  iterations: number;
};
export type Settings = {
  provider: ProviderId;
  theme: "light" | "dark" | "system";
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  projects: WorkspaceProject[];
  language: Language;
  localToolsEnabled: boolean;
  providers: Record<ProviderId, ProviderConfig>;
  vaults: Partial<Record<ProviderId, Cipher>>;
};
export const defaultSettings: Settings = {
  provider: "gemini",
  theme: "system",
  sidebarCollapsed: false,
  sidebarWidth: sidebarWidth.default,
  projects: [],
  language: "system",
  localToolsEnabled: true,
  providers: {
    gemini: {
      id: "gemini",
      model: "",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      vision: false,
    },
    openai: {
      id: "openai",
      model: "",
      endpoint: "https://api.openai.com/v1",
      vision: false,
    },
    anthropic: {
      id: "anthropic",
      model: "",
      endpoint: "https://api.anthropic.com/v1",
      vision: false,
    },
    openrouter: {
      id: "openrouter",
      model: "",
      endpoint: "https://openrouter.ai/api/v1",
      vision: false,
    },
    lmstudio: {
      id: "lmstudio",
      model: "",
      endpoint: "http://localhost:1234/v1",
      vision: false,
    },
  },
  vaults: {},
};
export const labels: Record<ProviderId, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
};
export const id = () => crypto.randomUUID();
