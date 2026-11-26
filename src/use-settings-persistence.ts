import { useRef } from "react";
import { credentialDestination } from "./credential-destination";
import { storage } from "./storage";
import { SettingsConflictError } from "./settings-edit";
import { rememberTheme } from "./theme";
import type { Settings as AppSettings } from "./types";
import type { createWorkspaceSession } from "./workspace-session";

type SettingsDependencies = {
  session: ReturnType<typeof createWorkspaceSession>;
  importing: { current: boolean };
  signal: AbortSignal;
  report: (error: unknown) => void;
  forgetLmStudio: () => void;
  settingsWrite: { current: Promise<void> };
  committedSettings: { current: AppSettings };
};

/** Serialize preference writes and reconcile only the latest optimistic edit. */
export function createSettingsActions({ session, importing, signal, report, forgetLmStudio, settingsWrite, committedSettings }: SettingsDependencies) {
  const queuePreferenceWrite = (save: () => Promise<void>) => {
    const write = settingsWrite.current.then(save);
    settingsWrite.current = write.catch(report);
    return write.then(
      () => true,
      () => false,
    );
  };
  const saveSettings = async (
    change:
      Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>),
  ) => {
    if (importing.current || signal.aborted) return false;
    const previous = session.get().settings;
    const next = {
      ...previous,
      ...(typeof change === "function" ? change(previous) : change),
    };
    if (
      credentialDestination(previous.providers.lmstudio) !==
      credentialDestination(next.providers.lmstudio)
    ) {
      forgetLmStudio();
    }
    session.update({ settings: next });
    const saved = await queuePreferenceWrite(async () => {
      try {
        committedSettings.current = await storage.saveSettings(previous, next);
        rememberTheme(committedSettings.current.theme);
      } catch (error) {
        if (error instanceof SettingsConflictError)
          committedSettings.current = error.current;
        throw error;
      }
    });
    // A newer optimistic edit may already be queued. Its commit will reconcile
    // the projection, including unrelated fields learned from the other tab.
    if (session.get().settings === next) {
      const committed = committedSettings.current;
      if (
        credentialDestination(next.providers.lmstudio) !==
        credentialDestination(committed.providers.lmstudio)
      ) {
        forgetLmStudio();
      }
      if (JSON.stringify(committed) !== JSON.stringify(next))
        session.update({ settings: committed });
    }
    return saved && !signal.aborted;
  };
  return { queuePreferenceWrite, saveSettings };
}

export function useSettingsPersistence({ initial, ...dependencies }: Omit<SettingsDependencies, "settingsWrite" | "committedSettings"> & { initial: AppSettings }) {
  const settingsWrite = useRef<Promise<void>>(Promise.resolve());
  const committedSettings = useRef(initial);
  return { settingsWrite, committedSettings, ...createSettingsActions({ ...dependencies, settingsWrite, committedSettings }) };
}
