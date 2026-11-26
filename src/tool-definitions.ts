const string = { type: "string" };
export const localToolDefinitions = [
  {
    name: "time_tool",
    description:
      "Get current time, format a timestamp in an IANA time zone, or calculate the difference between two ISO dates in milliseconds. Use the user's requested timezone.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["now", "convert", "difference"] },
        timezone: string,
        date: string,
        end: string,
      },
      required: ["action"],
    },
  },
  {
    name: "calculate",
    description:
      "Evaluate a synchronous JavaScript mathematical expression in an isolated sandbox. Supports Math and array methods.",
    parameters: {
      type: "object",
      properties: { expression: string },
      required: ["expression"],
    },
  },
  {
    name: "analyze_file",
    description:
      "List, summarize, or read text, CSV, or JSON attachments in this conversation. List provides attachment IDs. Identify a file by exact filename or ID. Read uses a character offset.",
    parameters: {
      type: "object",
      properties: {
        file: string,
        action: { type: "string", enum: ["list", "summary", "read"] },
        offset: { type: "integer" },
      },
      required: ["action"],
    },
  },
  {
    name: "text_tool",
    description:
      "Manipulate text locally using literal search and replace, regex extraction, or sort and deduplicate lines.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["replace", "sort", "unique", "find", "extract"],
        },
        text: string,
        search: string,
        replacement: string,
      },
      required: ["action", "text"],
    },
  },
  {
    name: "memory_tool",
    description:
      "Manage local user memories. List returns pages of keys using offset, and get reads one value. Save or delete only when requested by the user. Results are sent to the model.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "get", "save", "delete"] },
        key: string,
        value: string,
        offset: { type: "integer" },
      },
      required: ["action"],
    },
  },
] as const;
export const localToolNames: readonly string[] = localToolDefinitions.map(
  ({ name }) => name,
);
