import { effortFor } from "./reasoning-effort";
import { credentialFor } from "./credential-destination";
import type { Credentials } from "./credential-manager";
import { configureModel, type ModelOption } from "./model-options";
import { listModelOptions } from "./providers";
import { profileOverride, type ResolvedConfig, type RequestOverrides } from "./request-config";
import type { ProviderObservation } from "./reply-runner";
import type { WorkspaceView } from "./settings-sections";
import type { Conversation, ProviderConfig, ProviderId, Settings } from "./types";
import type { ModelCatalogs } from "./use-model-catalog";
import type { useConversationPersistence } from "./use-conversation-persistence";
import type { createWorkspaceSession } from "./workspace-session";
import type { createSettingsActions } from "./use-settings-persistence";

type ModelDependencies = {
  settings: Settings; config: Readonly<ProviderConfig>; effective: ResolvedConfig;
  view: WorkspaceView; chat: Conversation | undefined; editingProvider: ProviderId;
  setEditingProvider: (provider: ProviderId) => void; setDrawer: (open: boolean) => void;
  setView: (view: WorkspaceView) => void; session: ReturnType<typeof createWorkspaceSession>;
  signal: AbortSignal; resetProviderForm: () => void;
  saveSettings: ReturnType<typeof createSettingsActions>["saveSettings"];
  updateChat: ReturnType<typeof useConversationPersistence>["updateChat"];
  secrets: Credentials; setCatalogs: (update: (current: ModelCatalogs) => ModelCatalogs) => void;
  credentialRevision: { current: number }; providerObservationSequence: { current: number };
  setProviderObservation: (observation: ProviderObservation | undefined) => void;
  keyInput: string; notify: (text: string) => void;
  listModels?: typeof listModelOptions;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";

export function createModelActions({ settings, config, effective, view, chat, editingProvider, setEditingProvider, setDrawer, setView, session, signal: workspaceSignal, resetProviderForm, saveSettings, updateChat, secrets, setCatalogs, credentialRevision, providerObservationSequence, setProviderObservation, keyInput, notify: setNotice, listModels = listModelOptions }: ModelDependencies) {
  const browseProvider = (provider: ProviderId) => {
    if (editingProvider !== provider) resetProviderForm();
    setEditingProvider(provider);
  };
  const openProvider = (provider: ProviderId) => {
    if (workspaceSignal.aborted) return;
    browseProvider(provider);
    setDrawer(false);
    setView("providers");
  };
  const openSettings = () => openProvider(effective.config.id);
  const updateConfig = (patch: Partial<typeof config>) =>
    saveSettings((current) => ({
      providers: {
        ...current.providers,
        [config.id]: { ...current.providers[config.id], ...patch },
      },
    }));
  const setConversationConfig = (override?: RequestOverrides) => {
    if (chat && !session.get().navigating)
      void updateChat(chat.id, (current) => ({
        ...current,
        configOverride: override,
      }));
  };
  const toggleConversationConfig = () =>
    setConversationConfig(
      chat?.configOverride ? undefined : profileOverride(config),
    );
  const selectModel = (provider: ProviderId, option: ModelOption) => {
    if (view === "chat" && chat?.configOverride) {
      setConversationConfig(
        profileOverride(
          configureModel(
            provider === config.id ? config : settings.providers[provider],
            option,
          ),
        ),
      );
      return;
    }
    if (view === "chat" && provider !== settings.provider) resetProviderForm();
    void saveSettings((current) => ({
      ...(view === "chat" ? { provider } : {}),
      providers: {
        ...current.providers,
        [provider]: configureModel(current.providers[provider], option),
      },
    }));
  };
  const loadCatalog = async (provider: ProviderId, keyOverride?: string) => {
    const target = settings.providers[provider];
    workspaceSignal.throwIfAborted();
    const options = await listModels(
      target,
      keyOverride || credentialFor(target, secrets[provider]),
      workspaceSignal,
    );
    workspaceSignal.throwIfAborted();
    setCatalogs((current) => ({
      ...current,
      [provider]: { endpoint: target.endpoint, options },
    }));
    return options;
  };
  const setModelEffort = (value: string) => {
    const selected = effortFor(config.id, value);
    const provider = config.id;
    const model = config.model;
    if (!model || session.get().reply || session.get().navigating) return;
    if (chat?.configOverride)
      setConversationConfig(profileOverride({ ...config, reasoningEffort: selected }));
    void saveSettings((current) => ({
      providers: {
        ...current.providers,
        [provider]: {
          ...current.providers[provider],
          reasoningEfforts: { ...current.providers[provider].reasoningEfforts, [model]: selected },
          ...(current.providers[provider].model === model ? { reasoningEffort: selected } : {}),
        },
      },
    }));
  };
  const setReasoning = (enabled: boolean) => {
    const patch = { reasoningSupported: true, requestThoughts: enabled };
    if (view === "chat" && chat?.configOverride)
      setConversationConfig(profileOverride({ ...config, ...patch }));
    else void updateConfig(patch);
  };
  const testConnection = async () => {
    if (workspaceSignal.aborted) return;
    const target = settings.providers[config.id];
    const observation = {
      id: target.id,
      endpoint: target.endpoint,
      model: target.model,
      credentialRevision: credentialRevision.current,
    };
    const usesCurrentCredential =
      !keyInput || keyInput === credentialFor(target, secrets[target.id]);
    const observationSequence = usesCurrentCredential
      ? ++providerObservationSequence.current
      : undefined;
    try {
      setNotice("Connecting…");
      if (usesCurrentCredential)
        setProviderObservation({ ...observation, state: "connecting" });
      const result = await loadCatalog(config.id, keyInput);
      if (workspaceSignal.aborted) return;
      if (
        usesCurrentCredential &&
        observationSequence === providerObservationSequence.current
      )
        setProviderObservation({ ...observation, state: "catalog" });
      setNotice(
        result.length
          ? `Model list loaded (${result.length}). This does not verify your key or chat access. Select one or enter its ID.`
          : "Model list loaded but no models were listed. This does not verify your key or chat access; enter a model ID manually.",
      );
    } catch (e) {
      if (!workspaceSignal.aborted) {
        if (
          usesCurrentCredential &&
          observationSequence === providerObservationSequence.current
        )
          setProviderObservation({ ...observation, state: "failed" });
        setNotice(errorText(e));
      }
    }
  };
  return { browseProvider, openProvider, openSettings, updateConfig, toggleConversationConfig, selectModel, loadCatalog, setModelEffort, setReasoning, testConnection };
}
