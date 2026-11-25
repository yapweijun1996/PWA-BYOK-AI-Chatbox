export const slashCommands = [
  { name: "new", description: "Start a new chat" },
  { name: "search", description: "Search conversations" },
  { name: "model", description: "Choose model" },
  { name: "settings", description: "Open provider settings" },
  { name: "js", description: "Toggle local tools" },
] as const;

export type SlashCommand = (typeof slashCommands)[number]["name"];
