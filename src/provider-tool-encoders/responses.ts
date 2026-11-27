import { providerToolDefinitions } from "./definitions";

/** Responses API uses flat function declarations and explicitly disables strict mode. */
export const responsesTools = providerToolDefinitions.map((fn) => ({ type: "function", ...fn, strict: false }));
