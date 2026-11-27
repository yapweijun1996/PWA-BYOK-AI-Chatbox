import { createAdapter } from "./shared";
import type { ProviderTransport } from "./types";

export const createLmstudioAdapter = (request: ProviderTransport) => createAdapter("lmstudio", request);
