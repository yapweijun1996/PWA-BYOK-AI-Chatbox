import { mergeSettings } from "./data-contracts";
import { providerIds, type Settings } from "./types";

export class SettingsConflictError extends Error {
  constructor(readonly current: Settings) {
    super("Settings changed in another tab.");
  }
}

// A provider profile is one unit: never combine a stale model's capabilities
// with another tab's endpoint/model. Each vault and ordinary preference is independent.
export function applySettingsEdit(
  stored: Settings | undefined,
  before: Settings,
  after: Settings,
) {
  const current = mergeSettings(stored);
  const previous = mergeSettings(before);
  const desired = mergeSettings(after);
  // Leave unrelated raw fields alone, including profiles from a newer build.
  const next: Settings = {
    ...current,
    ...stored,
    providers: { ...current.providers, ...stored?.providers },
    vaults: { ...current.vaults },
  };
  const equal = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  function changed<T>(old: T, wanted: T, latest: T) {
    if (equal(old, wanted)) return false;
    if (!equal(old, latest) && !equal(latest, wanted))
      throw new SettingsConflictError(current);
    return true;
  }
  function apply<
    K extends
      | "theme"
      | "language"
      | "sidebarCollapsed"
      | "sidebarWidth"
      | "provider"
      | "projects"
      | "localToolsEnabled",
  >(key: K) {
    if (changed(previous[key], desired[key], current[key]))
      next[key] = desired[key];
  }
  apply("theme");
  apply("language");
  apply("sidebarCollapsed");
  apply("sidebarWidth");
  apply("provider");
  apply("projects");
  apply("localToolsEnabled");
  for (const id of providerIds) {
    if (
      changed(
        previous.providers[id],
        desired.providers[id],
        current.providers[id],
      )
    )
      next.providers[id] = { ...next.providers[id], ...desired.providers[id] };
    if (changed(previous.vaults[id], desired.vaults[id], current.vaults[id])) {
      if (
        id === "lmstudio" &&
        previous.providers[id].endpoint !== current.providers[id].endpoint
      )
        throw new SettingsConflictError(current);
      if (desired.vaults[id]) next.vaults[id] = desired.vaults[id];
      else delete next.vaults[id];
    }
  }
  return next;
}
