import { javascriptToolDescription, javascriptToolParameters, providerToolName } from "../javascript-tool";
import { localToolDefinitions } from "../tool-definitions";

const javascriptDefinition = { name: providerToolName, description: javascriptToolDescription, parameters: javascriptToolParameters };
export const providerToolDefinitions = [javascriptDefinition, ...localToolDefinitions];
