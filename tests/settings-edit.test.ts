import { describe, expect, it } from "vitest";
import { mergeSettings } from "../src/data-contracts";
import { portableConversation } from "../src/history-sharing";
import { applySettingsEdit, SettingsConflictError } from "../src/settings-edit";
import type { Cipher } from "../src/types";

const cipher: Cipher = {
  version: 1,
  salt: "fixture",
  iv: "fixture",
  data: "ciphertext",
  iterations: 1,
};
describe("transactional preference edits", () => {
  it("changes a theme without restoring another tab's prior provider, vault or projects", () => {
    const old = mergeSettings(undefined);
    old.vaults.openai = cipher;
    const saved = structuredClone(old);
    saved.provider = "lmstudio";
    saved.providers.lmstudio.endpoint = "https://local.example/new/v1";
    saved.providers.openai.model = "new-profile";
    saved.vaults = { gemini: cipher };
    saved.projects.push({ id: "new", name: "New" });
    expect(applySettingsEdit(saved, old, { ...old, theme: "dark" })).toEqual({
      ...saved,
      theme: "dark",
    });
  });

  it("treats one provider's model and capabilities as a unit and independent profiles as separate edits", () => {
    const old = mergeSettings(undefined);
    const saved = structuredClone(old);
    saved.providers.openai.model = "different-model";
    const local = structuredClone(old);
    local.providers.openai.vision = true;
    expect(() => applySettingsEdit(saved, old, local)).toThrow(
      SettingsConflictError,
    );
    const separate = structuredClone(old);
    separate.providers.gemini.model = "next-model";
    const merged = applySettingsEdit(saved, old, separate);
    expect(merged.providers.openai).toEqual(saved.providers.openai);
    expect(merged.providers.gemini).toEqual(separate.providers.gemini);
  });

  it("rejects an LM Studio vault edit if the approved destination moved", () => {
    const old = mergeSettings(undefined);
    const saved = structuredClone(old);
    saved.providers.lmstudio.endpoint = "https://local.example/new/v1";
    expect(() =>
      applySettingsEdit(saved, old, { ...old, vaults: { lmstudio: cipher } }),
    ).toThrow(SettingsConflictError);
  });

  it("does not accept a device revision or cloud consent from a backup", () => {
    const portable = {
      id: "c",
      title: "Chat",
      draft: "",
      messages: [],
      updatedAt: 1,
    };
    expect(
      portableConversation({
        ...portable,
        localRevision: "not-trusted",
        cloudHistoryRecipient: "openai",
      }),
    ).toEqual(portable);
  });
});
