export type ProviderId = "gemini" | "openai" | "lmstudio";
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
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  draft: string;
};
export type ProviderConfig = {
  id: ProviderId;
  model: string;
  endpoint: string;
  vision: boolean;
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
  providers: Record<ProviderId, ProviderConfig>;
  vaults: Partial<Record<ProviderId, Cipher>>;
};
export const defaultSettings: Settings = {
  provider: "gemini",
  theme: "system",
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
  lmstudio: "LM Studio",
};
export const id = () => crypto.randomUUID();
