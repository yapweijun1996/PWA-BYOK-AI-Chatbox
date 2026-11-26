import { describe, expect, it, vi } from "vitest";
import { createModelActions } from "../src/workspace-model-actions";
import { credentialDestination } from "../src/credential-destination";
import { resolveConfig } from "../src/request-config";
import { createWorkspaceSession } from "../src/workspace-session";
import { defaultSettings, type Conversation } from "../src/types";
import type { ModelCatalogs } from "../src/use-model-catalog";

function setup(override?: Conversation["configOverride"]) {
  const settings = structuredClone(defaultSettings);
  const chat: Conversation = { id: "chat", title: "Chat", draft: "", updatedAt: 1, messages: [], configOverride: override };
  const session = createWorkspaceSession({ threads: [chat], active: chat.id, settings });
  const effective = resolveConfig(settings, chat.configOverride);
  let catalogs: ModelCatalogs = {};
  const controller = new AbortController(), resetProviderForm = vi.fn(), notify = vi.fn(), setProviderObservation = vi.fn();
  const saveSettings = vi.fn(async (change: Partial<typeof settings> | ((current: typeof settings) => Partial<typeof settings>)) => {
    session.update({ settings: { ...session.get().settings, ...(typeof change === "function" ? change(session.get().settings) : change) } }); return true;
  });
  const updateChat = vi.fn(async (id: string, change: (value: Conversation) => Conversation) => {
    session.update({ threads: session.get().threads.map((item) => item.id === id ? change(item) : item) }); return true;
  });
  const listModels = vi.fn(async () => [{ id: "new-model" }]);
  const deps: Parameters<typeof createModelActions>[0] = {
    settings, config: effective.config, effective, view: "chat", chat, editingProvider: settings.provider,
    setEditingProvider: vi.fn(), setDrawer: vi.fn(), setView: vi.fn(), session, signal: controller.signal,
    resetProviderForm, saveSettings, updateChat, secrets: {}, setCatalogs: (update) => { catalogs = update(catalogs); },
    credentialRevision: { current: 0 }, providerObservationSequence: { current: 0 }, setProviderObservation, keyInput: "", notify, listModels,
  };
  return { session, settings, chat, effective, controller, resetProviderForm, saveSettings, updateChat, listModels, deps, getCatalogs: () => catalogs };
}

describe("workspace model actions", () => {
  it("changes the global provider and model without inheriting stale capabilities", () => {
    const { deps, session, resetProviderForm } = setup();
    createModelActions(deps).selectModel("openrouter", { id: "new-model", vision: true, reasoning: true });
    const settings = session.get().settings;
    expect(settings.provider).toBe("openrouter");
    expect(settings.providers.openrouter).toMatchObject({ model: "new-model", vision: true, reasoningSupported: true, requestThoughts: false });
    expect(resetProviderForm).toHaveBeenCalledOnce();
  });
  it("updates a conversation override without changing global provider settings", () => {
    const { deps, session, settings, updateChat } = setup({ provider: "lmstudio", model: "original" });
    createModelActions(deps).selectModel("openrouter", { id: "branch-model", vision: true });
    expect(updateChat).toHaveBeenCalledOnce();
    expect(session.get().settings).toBe(settings);
    expect(session.get().threads[0].configOverride).toMatchObject({ provider: "openrouter", model: "branch-model", vision: true });
  });
  it("does not pass a key bound to another destination to model discovery", async () => {
    const { deps, listModels, getCatalogs } = setup();
    deps.secrets.lmstudio = { destination: "https://other.example/v1", value: "test-secret" };
    await createModelActions(deps).loadCatalog("lmstudio");
    expect(listModels).toHaveBeenCalledWith(deps.settings.providers.lmstudio, "", deps.signal);
    expect(getCatalogs().lmstudio?.options).toEqual([{ id: "new-model" }]);
  });
  it("does not publish a catalog after the workspace is cancelled", async () => {
    const { deps, controller, getCatalogs } = setup();
    const gate = Promise.withResolvers<Array<{ id: string }>>();
    deps.listModels = () => gate.promise;
    const pending = createModelActions(deps).loadCatalog("lmstudio");
    controller.abort(); gate.resolve([{ id: "late" }]);
    await expect(pending).rejects.toThrow();
    expect(getCatalogs()).toEqual({});
  });
  it("uses a credential for its matching provider destination", async () => {
    const { deps, listModels } = setup();
    const provider = deps.settings.providers.lmstudio;
    deps.secrets.lmstudio = { destination: credentialDestination(provider)!, value: "test-secret" };
    await createModelActions(deps).loadCatalog("lmstudio");
    expect(listModels).toHaveBeenCalledWith(provider, "test-secret", deps.signal);
  });
});
