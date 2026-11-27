import type { OutputItem } from "../responses-types";
import type { Message, ProviderConfig, ProviderId } from "../types";
import type { ModelOption } from "../model-options";
import type { ResponseSample } from "../response-telemetry";
import type { ToolRequest, ToolRound } from "../provider-tool-types";

/** The shared network boundary preserves provider-specific authentication and error policy. */
export type ProviderTransport = (config: ProviderConfig, path: string, secret: string, init?: RequestInit) => Promise<Response>;
export type ProviderStreamInput = {
  config: ProviderConfig;
  secret: string;
  messages: Message[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onSample?: (sample: ResponseSample, receivedAt: number) => void;
  tool?: ToolRequest;
  onResponsesOutput?: (items: OutputItem[]) => void;
};
export interface ProviderAdapter {
  readonly id: ProviderId;
  listModels(config: ProviderConfig, secret: string, signal?: AbortSignal): Promise<ModelOption[]>;
  stream(input: ProviderStreamInput): Promise<ToolRound | undefined>;
}

