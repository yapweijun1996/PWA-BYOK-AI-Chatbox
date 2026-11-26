export const settingsSections = [
  ["providers", "AI providers"],
  ["appearance", "Appearance"],
  ["data", "Local data"],
] as const;

export type WorkspaceView = "chat" | (typeof settingsSections)[number][0];
