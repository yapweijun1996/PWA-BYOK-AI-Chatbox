export type ProviderId = "gemini" | "openai" | "openrouter" | "lmstudio";
import type { Language } from "./i18n";
import type { RequestOverrides, RequestSnapshot } from "./request-config";
import type { ResponseTelemetry } from "./response-telemetry";
import { sidebarWidth } from "./workspace";
export const providerIds: ProviderId[] = [
  "gemini",
  "openai",
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
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  createdAt: number;
  status?: "complete" | "streaming" | "interrupted" | "error";
  attachments?: Attachment[];
  telemetry?: ResponseTelemetry;
  request?: RequestSnapshot;
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  draft: string;
  draftAttachments?: Attachment[];
  pinned?: boolean;
  archived?: boolean;
  projectId?: string;
  configOverride?: RequestOverrides;
};
export type WorkspaceProject = { id: string; name: string };
export type ProviderConfig = {
  id: ProviderId;
  model: string;
  endpoint: string;
  vision: boolean;
  reasoningSupported?: boolean;
  requestThoughts?: boolean;
};
export type Cipher = {
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
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
};
export const id = () => crypto.randomUUID();
