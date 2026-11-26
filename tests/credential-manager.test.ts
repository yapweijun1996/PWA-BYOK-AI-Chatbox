import { describe, expect, it, vi } from "vitest";
import { createCredentialActions, restoreDeviceCredentials } from "../src/credential-manager";
import { credentialDestination } from "../src/credential-destination";
import { createWorkspaceSession } from "../src/workspace-session";
import { defaultSettings, type DeviceCipher, type Settings } from "../src/types";

const cipher = (data = "cipher"): DeviceCipher => ({ version: 2, iv: "iv", data, key: {} as CryptoKey });
const settingsWithVault = (): Settings => ({ ...defaultSettings, vaults: { openai: cipher() } });
const sessionFor = (settings: Settings) => createWorkspaceSession({ threads: [], active: "", settings });

describe("credential management", () => {
  it("binds saved LM Studio credentials to their destination", async () => {
    const config = { ...defaultSettings.providers.lmstudio, endpoint: "https://local.example/v1" };
    let settings = { ...defaultSettings, providers: { ...defaultSettings.providers, lmstudio: config } };
    const remember = vi.fn(), notify = vi.fn(), clearInput = vi.fn();
    const actions = createCredentialActions({ config, input: "test-key", saveOnDevice: true, signal: new AbortController().signal,
      saveSettings: async (change) => { settings = { ...settings, ...change(settings) }; return true; },
      remember, notify, clearInput, encrypt: async () => cipher(), });
    await actions.storeKey();
    expect(settings.vaults.lmstudio).toMatchObject({ version: 2, destination: credentialDestination(config) });
    expect(remember).toHaveBeenCalledWith("lmstudio", { destination: credentialDestination(config), value: "test-key" });
    expect(clearInput).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("Key saved on this device.");
  });

  it("does not persist or publish a key when the workspace is cleared during encryption", async () => {
    const controller = new AbortController();
    const pending = Promise.withResolvers<DeviceCipher>();
    const saveSettings = vi.fn(async () => true), remember = vi.fn(), notify = vi.fn(), clearInput = vi.fn();
    const actions = createCredentialActions({ config: defaultSettings.providers.openai, input: "test-key", saveOnDevice: true,
      signal: controller.signal, saveSettings, remember, notify, clearInput, encrypt: () => pending.promise });
    const operation = actions.storeKey();
    controller.abort();
    pending.resolve(cipher());
    await operation;
    expect(saveSettings).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(clearInput).not.toHaveBeenCalled();
  });

  it("keeps the session credential if removing the saved key fails", async () => {
    const remember = vi.fn(), notify = vi.fn();
    const actions = createCredentialActions({ config: defaultSettings.providers.openai, input: "", saveOnDevice: true,
      signal: new AbortController().signal, saveSettings: async () => false, remember, notify, clearInput: vi.fn() });
    await actions.deleteKey();
    expect(remember).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not restore an obsolete vault or a cancelled restore", async () => {
    const settings = settingsWithVault(), session = sessionFor(settings), restored = vi.fn(), failed = vi.fn();
    const pending = Promise.withResolvers<string>();
    restoreDeviceCredentials(settings, session, new AbortController().signal, restored, failed, () => pending.promise);
    session.update({ settings: { ...settings, vaults: { openai: cipher("new-cipher") } } });
    pending.resolve("old-key");
    await pending.promise; await Promise.resolve();
    expect(restored).not.toHaveBeenCalled();
    const second = Promise.withResolvers<string>();
    const cancel = restoreDeviceCredentials(settings, sessionFor(settings), new AbortController().signal, restored, failed, () => second.promise);
    cancel(); second.resolve("old-key");
    await second.promise; await Promise.resolve();
    expect(restored).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it("restores a current device vault bound to the provider destination", async () => {
    const settings = settingsWithVault(), restored = vi.fn(), failed = vi.fn();
    const pending = Promise.withResolvers<string>();
    restoreDeviceCredentials(settings, sessionFor(settings), new AbortController().signal, restored, failed, () => pending.promise);
    pending.resolve("device-key");
    await pending.promise; await Promise.resolve();
    expect(restored).toHaveBeenCalledWith("openai", { destination: credentialDestination(settings.providers.openai), value: "device-key" });
    expect(failed).not.toHaveBeenCalled();
  });

  it("ignores legacy vaults and device vaults bound to a different LM Studio endpoint", () => {
    const settings: Settings = { ...defaultSettings, vaults: {
      openai: { version: 1, salt: "salt", iv: "iv", data: "old", iterations: 600000 },
      lmstudio: { ...cipher(), destination: "https://other.example/v1" },
    } };
    const decrypt = vi.fn(async () => "key");
    restoreDeviceCredentials(settings, sessionFor(settings), new AbortController().signal, vi.fn(), vi.fn(), decrypt);
    expect(decrypt).not.toHaveBeenCalled();
  });
});
