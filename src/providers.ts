import { createProviderAdapters } from "./provider-adapters";
import { request } from "./provider-transport";
import type { Message, ProviderConfig } from "./types";
import type { ModelOption } from "./model-options";
import type { ResponseSample } from "./response-telemetry";
import type { ToolRequest, ToolRound } from "./provider-tool-types";
import type { OutputItem } from "./responses-types";
export { buildRequest, requestHistory, requiresLunaToolCompatibility } from "./provider-request";
export { providerBaseUrl, requestsStreamUsage } from "./provider-config";
export { parseEventStream } from "./event-stream";

const adapters = createProviderAdapters(request);
export async function listModelOptions(config: ProviderConfig, secret: string, signal?: AbortSignal): Promise<ModelOption[]> {
  return adapters[config.id].listModels(config, secret, signal);
}
export async function listModels(config: ProviderConfig, secret: string): Promise<string[]> {
  return (await listModelOptions(config, secret)).map(({ id }) => id);
}
export async function streamChat(
  config: ProviderConfig, secret: string, messages: Message[], signal: AbortSignal,
  onText: (text: string) => void, onReasoning: (text: string) => void = () => {},
  onSample?: (sample: ResponseSample, receivedAt: number) => void, tool?: ToolRequest,
  onResponsesOutput?: (items: OutputItem[]) => void,
): Promise<ToolRound | undefined> {
  return adapters[config.id].stream({ config, secret, messages, signal, onText, onReasoning, onSample, tool, onResponsesOutput });
}
