import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettingsActions } from "../src/use-settings-persistence";
import { createWorkspaceSession } from "../src/workspace-session";
import { storage } from "../src/storage";
import { SettingsConflictError } from "../src/settings-edit";
import { defaultSettings, type Settings } from "../src/types";

vi.mock("../src/theme", () => ({ rememberTheme: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function setup() {
  const settings = structuredClone(defaultSettings);
  const session = createWorkspaceSession({ threads: [], active: "", settings });
  const settingsWrite = { current: Promise.resolve() }, committedSettings = { current: settings }, importing = { current: false };
  const forgetLmStudio = vi.fn(), report = vi.fn(), controller = new AbortController();
  const actions = createSettingsActions({ session, settingsWrite, committedSettings, importing, signal: controller.signal, forgetLmStudio, report });
  return { session, settingsWrite, committedSettings, importing, forgetLmStudio, report, controller, actions };
}

describe("workspace settings persistence", () => {
  it("serializes optimistic writes and keeps the latest edit", async () => {
    const { actions, session } = setup();
    const gate = Promise.withResolvers<Settings>();
    const save = vi.spyOn(storage, "saveSettings").mockImplementationOnce(() => gate.promise).mockImplementationOnce(async (_before, after) => after);
    const first = actions.saveSettings({ theme: "dark" });
    const second = actions.saveSettings({ language: "ms" });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(session.get().settings.language).toBe("ms");
    gate.resolve({ ...session.get().settings, language: defaultSettings.language });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(session.get().settings).toMatchObject({ theme: "dark", language: "ms" });
  });
  it("reconciles a conflict to saved settings without retaining a stale endpoint credential", async () => {
    const { actions, session, report, forgetLmStudio } = setup();
    const current = session.get().settings;
    const conflict = { ...current, providers: { ...current.providers, lmstudio: { ...current.providers.lmstudio, endpoint: "https://other.example/v1" } } };
    vi.spyOn(storage, "saveSettings").mockRejectedValue(new SettingsConflictError(conflict));
    expect(await actions.saveSettings({ theme: "dark" })).toBe(false);
    expect(session.get().settings).toBe(conflict);
    expect(forgetLmStudio).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.any(SettingsConflictError));
  });
  it("refuses new writes during import or after workspace cancellation", async () => {
    const { actions, importing, controller } = setup();
    const save = vi.spyOn(storage, "saveSettings");
    importing.current = true;
    expect(await actions.saveSettings({ theme: "dark" })).toBe(false);
    importing.current = false; controller.abort();
    expect(await actions.saveSettings({ theme: "dark" })).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
