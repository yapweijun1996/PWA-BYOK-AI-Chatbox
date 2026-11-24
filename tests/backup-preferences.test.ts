import { describe, expect, it } from "vitest";
import {
  backupPreferences,
  mergeSettings,
  validBackup,
} from "../src/data-contracts";
import { checkedLmStudioAddress } from "../src/credential-destination";
import { defaultSettings } from "../src/types";

function settingsAt(endpoint: string) {
  const settings = structuredClone(defaultSettings);
  settings.providers.lmstudio.endpoint = endpoint;
  return settings;
}

describe("v1 backup server addresses", () => {
  it.each([
    "not an address",
    "https://dummy:password@example.test/v1",
    "https://example.test/v1?token=dummy",
    "https://example.test/v1#dummy",
    "https://example.test/v1?",
    "https://example.test/v1#",
  ])(
    "omits a rejected address instead of serializing or redirecting it (%s)",
    (address) => {
      const legacy = settingsAt(address);
      expect(checkedLmStudioAddress(address)).toBeUndefined();
      const restored = mergeSettings(legacy);
      expect(restored.providers.lmstudio.endpoint).toBe("");
      for (const settings of [legacy, restored]) {
        const result = backupPreferences(settings);
        expect(result.omittedServerAddress).toBe(true);
        expect(result.preferences.providers.lmstudio).not.toHaveProperty(
          "endpoint",
        );
        expect(JSON.stringify(result.preferences)).not.toContain(address);
      }
    },
  );

  it("round-trips a valid custom path and exports only portable preference fields", () => {
    const address = "https://example.test:8443/local/proxy/v1/";
    const settings = settingsAt(address);
    Object.assign(settings, { futurePrivateField: "private-setting" });
    Object.assign(settings.providers.lmstudio, {
      token: "private-provider-field",
    });
    settings.providers.openai.endpoint =
      "https://wrong.example.test/?token=dummy";
    const { preferences, omittedServerAddress } = backupPreferences(settings);
    expect(omittedServerAddress).toBe(false);
    expect(preferences).not.toHaveProperty("vaults");
    expect(preferences).not.toHaveProperty("futurePrivateField");
    expect(preferences.providers.lmstudio).not.toHaveProperty("token");
    expect(preferences.providers.openai.endpoint).toBe(
      defaultSettings.providers.openai.endpoint,
    );
    const backup: unknown = {
      version: 1,
      conversations: [],
      settings: preferences,
    };
    if (!validBackup(backup)) throw new Error("Expected a v1 backup");
    expect(mergeSettings(backup.settings).providers.lmstudio.endpoint).toBe(
      address,
    );
  });

  it("keeps the existing destination when importing invalid or omitted addresses", () => {
    const current = "https://example.test/custom/v1";
    const legacy = settingsAt("https://unapproved.example.test/?private");
    expect(mergeSettings(legacy, current).providers.lmstudio.endpoint).toBe(
      current,
    );
    const backup: unknown = {
      version: 1,
      conversations: [],
      settings: backupPreferences(legacy).preferences,
    };
    if (!validBackup(backup)) throw new Error("Expected a v1 backup");
    expect(
      mergeSettings(backup.settings, current).providers.lmstudio.endpoint,
    ).toBe(current);
  });
});
