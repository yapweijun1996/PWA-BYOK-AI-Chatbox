import { buildRequest } from "../provider-request";
import { consumeProviderStream } from "../provider-stream";
import { parseModelOptions, type ModelOption } from "../model-options";
import type { ToolRound } from "../provider-tool-types";
import type { ProviderConfig, ProviderId } from "../types";
import type { ProviderAdapter, ProviderStreamInput, ProviderTransport } from "./types";

async function discoverModels(request: ProviderTransport, config: ProviderConfig, secret: string, signal?: AbortSignal): Promise<ModelOption[]> {
  const response = await request(config, "/models", secret, { signal });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Provider returned an invalid model list.");
  }
  if (!data || typeof data !== "object")
    throw new Error("Provider returned an invalid model list.");
  return parseModelOptions(config.id, data);
}

export async function streamStandard(request: ProviderTransport, input: ProviderStreamInput): Promise<ToolRound | undefined> {
  const { config, secret, messages, signal, onText, onReasoning, onSample, tool } = input;
  validateInput(input);
  const { path, body } = buildRequest(config, messages, tool);
  const response = await request(config, path, secret, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (!response.body)
    throw new Error("The provider returned an empty response.");
  return consumeProviderStream({
    provider: config.id, stream: response.body, signal, onText, onReasoning, onSample, tool,
  });
}
export function validateInput(input: ProviderStreamInput) {
  const { config, secret, messages } = input;
  if (!config.model.trim())
    throw new Error("Choose or enter a model in Providers.");
  if (config.id !== "lmstudio" && !secret)
    throw new Error("Enter an API key in Providers.");
  if (
    !config.vision &&
    messages.some((m) =>
      m.attachments?.some((a) => a.mime.startsWith("image/")),
    )
  )
    throw new Error(
      "Enable image support for this model in Providers before sending images.",
    );

}
export function createAdapter(id: ProviderId, request: ProviderTransport, stream: (input: ProviderStreamInput) => ReturnType<ProviderAdapter["stream"]> = (input) => streamStandard(request, input)): ProviderAdapter {
  return {
    id,
    listModels(config, secret, signal) {
      if (config.id !== id) return Promise.reject(new Error("Provider configuration does not match adapter."));
      return discoverModels(request, config, secret, signal);
    },
    stream(input) {
      if (input.config.id !== id) return Promise.reject(new Error("Provider configuration does not match adapter."));
      return stream(input);
    },
  };
}
