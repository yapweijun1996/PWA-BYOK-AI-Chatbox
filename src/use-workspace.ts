import { effortFor } from "./reasoning-effort";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { version } from "../package.json";
import type { SearchMode } from "./components/WorkspaceSearch";
import { mergeProjects, mostRecentVisible } from "./workspace";
import { clearSidebarPreferences } from "./sidebar-preferences";
import { canRequestReasoning, configureModel } from "./model-options";
import type { ModelOption } from "./model-options";
import { formatSize } from "./format-size";
import { readAttachment } from "./attachments";
import { activePath, activateBranch, asBranchConversation, pathTo, removeBranch, selectBranch } from "./branches";
import { copyConversationSelection } from "./message-copy";
import type { PreferenceProps } from "./components/Preferences";
import type { ReplyPhase } from "./components/Composer";
import { safeDiagnosticLabel, useOriginStorage } from "./workspace-inspection";
import { responseIdentity } from "./response-telemetry";
import { createReplyRunner, type ProviderObservation } from "./reply-runner";
import { useAppUpdate } from "./pwa-update";
import {
  captureRequest,
  profileOverride,
  resolveConfig,
} from "./request-config";
import type {
  RequestOverrides,
  ResolvedConfig,
  RequestSnapshot,
} from "./request-config";
import { useWorkspaceSession, selectActiveChat } from "./workspace-state";
import { useConversationPersistence } from "./use-conversation-persistence";
import { createConversationActions } from "./workspace-conversations";
import { useConversationScroll } from "./use-conversation-scroll";
import { resolveLanguage, translate } from "./i18n";
import { ConversationConflictError, ImportConflictError, storage } from "./storage";
import { SettingsConflictError } from "./settings-edit";
import type { InitialAppState } from "./startup";
import {
  applyTheme,
  readSystemDark,
  rememberTheme,
  resolveTheme,
  subscribeSystemDark,
} from "./theme";
import { mergeSettings, recoverMessage, type Backup } from "./data-contracts";
import { downloadBackup, planBackupExport, readBackupFile, type ExportPlan } from "./backup";
import {
  cloudRecipient,
  needsHistoryChoice,
  portableConversation,
  type HistoryChoice,
} from "./history-sharing";
import { decryptDeviceSecret, encryptDeviceSecret } from "./crypto";
import { listModelOptions } from "./providers";
import { requestHistory } from "./provider-request";
import {
  checkedLmStudioAddress,
  credentialDestination,
  credentialFor,
  type SessionCredential,
} from "./credential-destination";
import { defaultSettings, id, providerIds as providers } from "./types";
import type {
  Attachment,
  Conversation,
  Message,
  ProviderId,
  Settings as AppSettings,
} from "./types";

import type { WorkspaceView as View } from "./settings-sections";
type Secrets = Partial<Record<ProviderId, SessionCredential>>;
const imageSupportNotice =
  "This model does not support images in the draft or conversation. Choose an image-capable model or remove draft images.";
const offlineNotice =
  "You are offline. You can keep drafting; reconnect to send to this provider.";
const setupNotice = "Set up a model and provider credentials before sending.";
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
export function useWorkspace({
  initial,
  onInitialCommit,
}: {
  initial: InitialAppState;
  onInitialCommit: () => void;
}) {
  const { session, state } = useWorkspaceSession(initial);
  // Non-exclusive operations (Web Crypto, file reads, catalogs) may outlive
  // their initiating view. A confirmed clear retires their signal synchronously.
  const [lifetime, setLifetime] = useState(() => new AbortController());
  const { signal: workspaceSignal } = lifetime;
  const {
    threads,
    active,
    settings,
    reply: activeReply,
    processingFiles,
    navigating,
  } = state;
  const phase: ReplyPhase = activeReply?.phase ?? "idle";
  const [systemLanguage, setSystemLanguage] = useState(
    () => navigator.language,
  );
  const locale = resolveLanguage(settings.language, systemLanguage);
  const t = (text: string) => translate(locale, text);
  const [secrets, setSecrets] = useState<Secrets>({});
  // Device keys can be restored without a password; legacy password vaults remain untouched.
  useEffect(() => {
    let cancelled = false;
    for (const [provider, vault] of Object.entries(settings.vaults)) {
      if (!vault || vault.version !== 2) continue;
      const target = settings.providers[provider as ProviderId];
      const destination = credentialDestination(target);
      if (!destination || (target.id === "lmstudio" && vault.destination !== destination)) continue;
      void decryptDeviceSecret(vault).then((value) => {
        const current = session.get().settings;
        if (cancelled || workspaceSignal.aborted || current.vaults[target.id]?.data !== vault.data || credentialDestination(current.providers[target.id]) !== destination) return;
        setSecrets((previous) => previous[target.id] ? previous : { ...previous, [target.id]: { destination, value } });
      }).catch(() => { if (!cancelled) setNotice("Could not restore the saved key. Enter it again in Providers."); });
    }
    return () => { cancelled = true; };
  }, [settings.vaults, settings.providers, session, workspaceSignal]);
  const credentialRevision = useRef(0);
  const previousSecrets = useRef(secrets);
  if (previousSecrets.current !== secrets) {
    previousSecrets.current = secrets;
    credentialRevision.current++;
  }
  const [view, setView] = useState<View>("chat");
  const [editingProvider, setEditingProvider] = useState(settings.provider);
  const [historyTarget, setHistoryTarget] = useState<ProviderId>();
  const historyDecision = useRef<((choice: HistoryChoice) => void) | null>(null);
  const finishHistoryChoice = (choice: HistoryChoice) => {
    const decide = historyDecision.current;
    historyDecision.current = null;
    setHistoryTarget(undefined);
    decide?.(choice);
  };
  useEffect(() => () => historyDecision.current?.("cancel"), []);
  const [drawer, setDrawer] = useState(false);
  const [desktop, setDesktop] = useState(
    () => matchMedia("(min-width: 768px)").matches,
  );
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null);
  const [searchMatch, setSearchMatch] = useState<{ chatId: string; messageId: string; sequence: number }>();
  const searchSequence = useRef(0);
  const clearSearchMatch = useCallback((sequence: number) => setSearchMatch((current) => current?.sequence === sequence ? undefined : current), []);
  const [inspecting, setInspecting] = useState(false);
  const javascriptEnabled = settings.localToolsEnabled;
  const toggleJavaScript = () => {
    if (!active || session.get().reply) return;
    const enabled = !session.get().settings.localToolsEnabled;
    void saveSettings({ localToolsEnabled: enabled }).then((saved) => {
      if (saved) setNotice(enabled
        ? "Local tools enabled. Results go to the selected provider."
        : "Local tools disabled.");
    });
  };
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const [noticeState, setNoticeState] = useState({ text: "", revision: 0 });
  const notice = noticeState.text;
  const setNotice = useCallback((value: React.SetStateAction<string>) => {
    setNoticeState((previous) => ({
      text: typeof value === "function" ? value(previous.text) : value,
      revision: previous.revision + 1,
    }));
  }, []);
  const prepareUpdate = useRef<() => Promise<boolean>>(async () => false);
  const pwa = useAppUpdate(setNotice, () => prepareUpdate.current());
  const { checking, check } = pwa;
  const updateLabel = `${t("Check for updates")} · v${version}`;
  const working = activeReply !== null;
  const [online, setOnline] = useState(() => navigator.onLine);
  const [providerObservation, setProviderObservation] = useState<ProviderObservation>();
  const providerObservationSequence = useRef(0);
  const [catalogs, setCatalogs] = useState<
    Partial<Record<ProviderId, { endpoint: string; options: ModelOption[] }>>
  >({});
  const [credentialInput, setCredentialInput] = useState<SessionCredential & { provider: ProviderId }>();
  const [saveKey, setSaveKey] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const { info: originStorage, refresh: refreshStorage } = useOriginStorage(
    view === "data" || inspecting,
  );
  const [exportPlan, setExportPlan] = useState<ExportPlan | null>(null);
  // Keep the chosen snapshot downloadable even if a reply is still streaming.
  useEffect(() => setExportPlan(null), [view]);
  const [importPreview, setImportPreview] = useState<(Backup & {
    existing: Map<string, Conversation>; previousSettings: AppSettings;
  }) | null>(null);
  const [importPreferences, setImportPreferences] = useState(false);
  const importing = useRef(false);
  const fileSelection = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const report = useCallback(
    (error: unknown) => {
      if (error instanceof ConversationConflictError) {
        const current = session.get();
        if (!current.conflicts.has(error.chatId))
          session.update({
            conflicts: new Set(current.conflicts).add(error.chatId),
          });
        if (
          current.reply?.conversationId === error.chatId &&
          current.reply.phase === "streaming"
        )
          current.reply.controller.abort();
        setNotice(
          "Conversation changed in another tab. This tab did not overwrite it.",
        );
      } else if (error instanceof SettingsConflictError) {
        setNotice(
          "These settings changed in another tab. Review the saved settings before trying again.",
        );
      } else
        setNotice(
          `Storage error: ${errorText(error)} Your visible work is retained; export it before reloading.`,
        );
    },
    [session],
  );
  const persistence = useConversationPersistence(session, report);
  const { draftTimers, writes, queueSave, updateChat, flushDraft, flushDrafts } = persistence;
  const retryLocalSave = async (message: Message) => {
    const current = session.get();
    const target = selectActiveChat(current);
    if (!target || current.navigating || current.reply) return;
    if (current.conflicts.has(target.id)) return;
    const failed = current.replySaves.get(target.id);
    if (failed?.status !== "failed" || failed.message !== message) return;
    // Includes the latest draft; never invokes the provider.
    if (await queueSave(target))
      setNotice((previous) =>
        previous === notice && previous.startsWith("Storage error:") ? "" : previous,
      );
  };
  prepareUpdate.current = async () => {
    const current = session.get();
    if (current.reply || current.processingFiles || current.navigating || current.conflicts.size || [...current.replySaves.values()].some((save) => save.status === "failed")) return false;
    flushDrafts();
    const saved = await Promise.all(Object.values(writes.current));
    return saved.every(Boolean) && storage.getWriteStatus().pending === 0 && storage.getWriteStatus().lastOutcome !== "failed";
  };
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushDrafts();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushDrafts);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushDrafts);
      flushDrafts();
    };
  }, [flushDrafts]);
  const systemDark = useSyncExternalStore(subscribeSystemDark, readSystemDark);
  const effectiveTheme = resolveTheme(settings.theme, systemDark);
  useLayoutEffect(() => applyTheme(effectiveTheme), [effectiveTheme]);
  const settingsWrite = useRef<Promise<void>>(Promise.resolve());
  const committedSettings = useRef(initial.settings);
  useEffect(() => {
    const update = () => setSystemLanguage(navigator.language);
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const update = () => {
      setDesktop(media.matches);
      if (media.matches) setDrawer(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const showingSettings = view !== "chat";
  const mobileDrawer = !desktop && drawer;
  useLayoutEffect(() => {
    if (showingSettings)
      settingsHeading.current?.focus({ preventScroll: true });
  }, [showingSettings]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        document.documentElement.dataset.startup !== "ready" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.isComposing ||
        event.key.toLowerCase() !== "k" ||
        document.querySelector('dialog[open], .composer[data-expanded="true"]')
      )
        return;
      event.preventDefault();
      setSearchMode("active");
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const closeDrawer = () => {
    setDrawer(false);
    // Focus after React makes the main view interactive again.
    requestAnimationFrame(() =>
      drawerToggle.current?.focus({ preventScroll: true }),
    );
  };
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
    if (importing.current || workspaceSignal.aborted) return false;
    const previous = session.get().settings;
    const next = {
      ...previous,
      ...(typeof change === "function" ? change(previous) : change),
    };
    if (
      credentialDestination(previous.providers.lmstudio) !==
      credentialDestination(next.providers.lmstudio)
    ) {
      setSecrets((current) => ({ ...current, lmstudio: undefined }));
      resetProviderForm();
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
        setSecrets((current) => ({ ...current, lmstudio: undefined }));
        resetProviderForm();
      }
      if (JSON.stringify(committed) !== JSON.stringify(next))
        session.update({ settings: committed });
    }
    return saved && !workspaceSignal.aborted;
  };
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const chat = selectActiveChat(state);
  const effective = resolveConfig(settings, chat?.configOverride);
  const config =
    view === "providers"
      ? settings.providers[editingProvider]
      : effective.config;
  const keyInput = credentialInput?.provider === config.id ? credentialFor(config, credentialInput) : "";
  const setKeyInput = (value: string) => {
    const destination = credentialDestination(config);
    setCredentialInput(value && destination ? { destination, value, provider: config.id } : undefined);
  };
  const modelGroups = useMemo(
    () =>
      providers.map((provider) => {
        const { model, endpoint } = settings.providers[provider];
        const catalog = catalogs[provider];
        const options = catalog?.endpoint === endpoint ? catalog.options : [];
        return {
          provider,
          options:
            model && !options.some(({ id }) => id === model)
              ? [{ id: model }, ...options]
              : options,
        };
      }),
    [catalogs, settings.providers],
  );
  const models =
    modelGroups.find(({ provider }) => provider === config.id)?.options || [];
  const selectedModel =
    models.find(({ id }) => id === config.model) ??
    (config.model ? { id: config.model } : undefined);
  const reasoningAvailable =
    Boolean(selectedModel) &&
    canRequestReasoning(config.id) &&
    (selectedModel?.reasoning === true ||
      config.reasoningSupported === true ||
      config.requestThoughts === true);
  const reasoningLabel = t(
    config.id === "gemini" ? "Request thought summaries" : "Request reasoning",
  );
  const displayedDraft =
    activeReply?.phase === "saving" && activeReply.draft?.id === active
      ? activeReply.draft
      : chat;
  const files = chat?.draftAttachments || [];
  const hasImage = (attachments?: Attachment[]) =>
    attachments?.some((file) => file.mime.startsWith("image/"));
  const visibleMessages = chat ? activePath(chat) : [];
  const editSource = chat?.editState && asBranchConversation(chat).messages.find((message) => message.id === chat.editState?.sourceId);
  const draftHistory = chat && editSource ? pathTo(chat, editSource.parentId) : visibleMessages;
  const blockedFor = (target: ResolvedConfig["config"], history = draftHistory) =>
    !online && target.id !== "lmstudio"
      ? offlineNotice
      : !target.vision && history.some((message) => hasImage(message.attachments))
        ? imageSupportNotice
        : undefined;
  const sendBlocked =
    blockedFor(effective.config) ||
    (!effective.config.vision && hasImage(files)
      ? imageSupportNotice
      : undefined);
  const hasMessages = Boolean(visibleMessages.length);
  const { messagesContent, conversation, followReply, onMessageScroll } = useConversationScroll(active, view, hasMessages);
  useLayoutEffect(onInitialCommit, [onInitialCommit]);
  useEffect(() => {
    const copy = (event: ClipboardEvent) => {
      const list = messagesContent.current;
      const current = selectActiveChat(session.get());
      if (list && current)
        copyConversationSelection(event, list, activePath(current));
    };
    document.addEventListener("copy", copy);
    return () => document.removeEventListener("copy", copy);
  }, [session]);
  const configured = (target: ResolvedConfig["config"]) =>
    !!target.model.trim() &&
    (target.id === "lmstudio"
      ? Boolean(credentialDestination(target))
      : Boolean(credentialFor(target, secrets[target.id])));
  const isConfigured = configured(effective.config);
  const desktopInput = desktop && matchMedia("(pointer: fine)").matches;
  const hasDraft = Boolean(chat?.draft.trim() || files.length);
  const replySave = state.replySaves.get(active);
  const localSaveNotice = replySave?.status === "failed"
    ? "Save the reply locally before sending again."
    : replySave ? "Saving reply locally…" : undefined;
  const composerBlocked = (state.conflicts.has(active) && "Save a separate copy before sending from this tab.") || localSaveNotice || sendBlocked || (hasDraft && !isConfigured ? setupNotice : undefined);
  const editDraft = (draft: string) => {
    if (!chat || phase === "saving" || session.get().navigating) return;
    const chatId = chat.id;
    void updateChat(chatId, (current) => ({ ...current, draft }), false);
    if (session.get().conflicts.has(chatId)) return;
    const pending = draftTimers.current.get(chatId);
    if (pending !== undefined) window.clearTimeout(pending);
    draftTimers.current.set(
      chatId,
      window.setTimeout(() => flushDraft(chatId), 350),
    );
  };
  const { navigateChat, create, choose, openSearchResult, remove, organizeChat, keepConflictCopy } = createConversationActions({
    session, persistence, queuePreferenceWrite, settingsWrite, followReply, setView, mobileDrawer,
    closeDrawer, searchSequence, setSearchMatch, setNotice, report, t,
  });
  const saveProject = async (
    name: string,
    projectId?: string,
    chatId?: string,
  ) => {
    const key = projectId ?? id();
    const projects = projectId
      ? settings.projects.map((project) =>
          project.id === key ? { ...project, name } : project,
        )
      : [...settings.projects, { id: key, name }];
    if ((await saveSettings({ projects })) && chatId)
      await organizeChat(chatId, { projectId: key });
  };
  const deleteProject = (projectId: string) => {
    if (
      session
        .get()
        .threads.some((conversation) => conversation.projectId === projectId)
    )
      return;
    return saveSettings((current) => ({
      projects: current.projects.filter((project) => project.id !== projectId),
    }));
  };
  const resetProviderForm = () => {
    setCredentialInput(undefined);
    setSaveKey(true);
    setShowKey(false);
  };
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
    const options = await listModelOptions(
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
  const processFiles = async (selected: File[]) => {
    if (
      !selected.length ||
      !chat ||
      session.get().navigating ||
      session.get().reply ||
      session.get().processingFiles
    )
      return;
    const chatId = chat.id;
    session.update({ processingFiles: true });
    const result: Attachment[] = [];
    try {
      for (const file of selected) result.push(await readAttachment(file));
      await updateChat(chatId, (current) => ({
        ...current,
        draftAttachments: [...(current.draftAttachments || []), ...result],
      }));
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      session.update({ processingFiles: false });
    }
  };
  const beginReply = (
    conversationId: string,
    request: RequestSnapshot,
    draft: Conversation | null,
  ) => {
    const controller = new AbortController();
    session.update({
      reply: { phase: "saving", conversationId, controller, draft, request },
    });
    return controller;
  };
  const isCurrentReply = (abort: AbortController) =>
    session.get().reply?.controller === abort;
  const finishReply = (abort: AbortController) => {
    if (isCurrentReply(abort)) session.update({ reply: null });
  };
  const stopReply = () => {
    const current = session.get().reply;
    if (current?.phase !== "streaming" || current.controller.signal.aborted)
      return;
    session.update({ reply: { ...current, phase: "stopping" } });
    current.controller.abort();
  };
  const prepareReply = (resolved: ResolvedConfig, history: Message[]) => {
    const target = Object.freeze({ ...resolved.config });
    const request = captureRequest(resolved, Date.now(), javascriptEnabled);
    const telemetry = responseIdentity(target);
    const catalog = catalogs[target.id];
    const pricing =
      catalog?.endpoint === target.endpoint &&
      !history.some((message) => hasImage(message.attachments))
        ? catalog.options.find((model) => model.id === target.model)?.pricing
        : undefined;
    const message: Message = {
      id: id(),
      role: "assistant",
      content: "",
      createdAt: request.capturedAt,
      status: "streaming",
      telemetry,
      request,
    };
    return {
      message,
      request,
      telemetry,
      target,
      pricing,
      secret: credentialFor(target, secrets[target.id]),
      credentialRevision: credentialRevision.current,
    };
  };
  const runReply = createReplyRunner({ session, setNotice, isCurrentReply, updateChat, providerObservationSequence, setProviderObservation, finishReply });
  const canStartReply = (source: Conversation | undefined) => {
    const current = session.get();
    return !workspaceSignal.aborted && !current.reply && !current.navigating && !current.processingFiles &&
      !(source && (current.replySaves.has(source.id) || current.conflicts.has(source.id))) &&
      !historyDecision.current && current.settings === settings &&
      selectActiveChat(current) === source;
  };
  const askToShareHistory = async (
    source: Conversation,
    target: ResolvedConfig["config"],
  ) => {
    if (historyDecision.current) return false;
    const choice = await new Promise<HistoryChoice>((resolve) => {
      historyDecision.current = resolve;
      setHistoryTarget(target.id);
    });
    if (choice === "cancel") return false;
    if (!canStartReply(source)) {
      setNotice("The chat or its settings changed. Please send again.");
      return false;
    }
    if (choice === "fresh") {
      await navigateChat(undefined, profileOverride(target));
      return false;
    }
    if (!navigator.onLine) {
      setNotice(offlineNotice);
      return false;
    }
    return true;
  };
  const send = async () => {
    if (!canStartReply(chat)) return;
    if (!chat) {
      setNotice("Start a new chat first.");
      return;
    }
    if (!chat.draft.trim() && !files.length) return;
    if (!isConfigured) {
      setNotice(
        "Choose a model and enter your key in Providers. LM Studio does not require a key unless authentication is enabled.",
      );
      openProvider(effective.config.id);
      return;
    }
    if (sendBlocked) {
      setNotice(sendBlocked);
      return;
    }
    if (needsHistoryChoice(chat, effective.config.id, draftHistory) &&
      !(await askToShareHistory(chat, effective.config))) return;
    followReply.current = true;
    const tree = asBranchConversation(chat);
    const source = chat.editState && tree.messages.find((message) => message.id === chat.editState?.sourceId);
    if (chat.editState && !source) { setNotice("The edited message is no longer available."); return; }
    const parentId = source ? source.parentId ?? null : tree.activeMessageId;
    const user: Message = {
      id: id(),
      parentId,
      role: "user",
      content: chat.draft,
      attachments: files,
      createdAt: Date.now(),
      status: "complete",
    };
    const history = [...pathTo(tree, parentId), user];
    const prepared = prepareReply(effective, history);
    const reply = prepared.message;
    reply.parentId = user.id;
    const chatId = chat.id;
    const nextTitle =
      chat.title === "New chat"
        ? chat.draft.trim().slice(0, 60) || files[0]?.name || "New chat"
        : chat.title;
    const abort = beginReply(chatId, prepared.request, chat);
    const saved = await updateChat(chatId, (c) => activateBranch({
      ...c,
      branchVersion: 1,
      preferredBranches: tree.preferredBranches,
      activeMessageId: reply.id,
      title: nextTitle,
      cloudHistoryRecipient: cloudRecipient(prepared.target.id),
      cloudHistoryKnownIds: prepared.target.id === "lmstudio" ? undefined : [...new Set([...(chat.cloudHistoryRecipient === prepared.target.id ? chat.cloudHistoryKnownIds ?? [] : []), ...requestHistory(history).map((message) => message.id), reply.id])],
      draft: "",
      draftAttachments: [],
      editState: undefined,
      updatedAt: Date.now(),
      messages: [...tree.messages, user, reply],
    }, reply.id));
    if (!saved) {
      updateChat(chatId, (c) => ({
        ...c,
        title: c.title === nextTitle ? chat.title : c.title,
        cloudHistoryRecipient: chat.cloudHistoryRecipient,
        cloudHistoryKnownIds: chat.cloudHistoryKnownIds,
        draft: c.draft ? `${user.content}\n${c.draft}` : user.content,
        draftAttachments: [
          ...(user.attachments || []),
          ...(c.draftAttachments || []),
        ],
        editState: chat.editState,
        messages: chat.messages,
        branchVersion: chat.branchVersion,
        activeMessageId: chat.activeMessageId,
        preferredBranches: chat.preferredBranches,
      }));
      finishReply(abort);
      if (session.get().conflicts.has(chatId)) return;
      setNotice(
        "Message was not sent because local storage failed. Your draft and attachments are still visible.",
      );
      return;
    }
    await runReply(chatId, history, prepared, abort);
  };
  const retry = async (original?: RequestSnapshot, messageId?: string) => {
    if (!chat || !canStartReply(chat)) return;
    if (chat.editState) { setNotice("Finish or cancel editing before changing branches."); return; }
    const tree = asBranchConversation(chat);
    const targetMessage = tree.messages.find((message) => message.id === (messageId ?? tree.activeMessageId));
    if (!targetMessage || targetMessage.role !== "assistant" || targetMessage.status === "streaming") return;
    const history = pathTo(tree, targetMessage.parentId);
    const resolved = original
      ? resolveConfig(
          settings,
          chat.configOverride,
          profileOverride({ ...original, id: original.provider }),
        )
      : effective;
    const blocked = blockedFor(resolved.config, history);
    if (blocked) {
      setNotice(blocked);
      return;
    }
    if (!configured(resolved.config)) {
      setNotice("Set up a model and provider credentials before sending.");
      openProvider(resolved.config.id);
      return;
    }
    if (needsHistoryChoice(chat, resolved.config.id, history) &&
      !(await askToShareHistory(chat, resolved.config))) return;
    const prepared = prepareReply(resolved, history);
    const reply = prepared.message;
    reply.parentId = targetMessage.parentId ?? null;
    const abort = beginReply(chat.id, prepared.request, null);
    const saved = await updateChat(chat.id, (c) => activateBranch({
      ...c,
      branchVersion: 1,
      preferredBranches: tree.preferredBranches,
      activeMessageId: reply.id,
      messages: [...tree.messages, reply],
      cloudHistoryRecipient: cloudRecipient(prepared.target.id),
      cloudHistoryKnownIds: prepared.target.id === "lmstudio" ? undefined : [...new Set([...(chat.cloudHistoryRecipient === prepared.target.id ? chat.cloudHistoryKnownIds ?? [] : []), ...requestHistory(history).map((message) => message.id), reply.id])],
      updatedAt: Date.now(),
    }, reply.id));
    if (!saved) {
      updateChat(chat.id, (c) => ({
        ...c,
        messages: chat.messages,
        branchVersion: chat.branchVersion,
        activeMessageId: chat.activeMessageId,
        preferredBranches: chat.preferredBranches,
        cloudHistoryRecipient: chat.cloudHistoryRecipient,
        cloudHistoryKnownIds: chat.cloudHistoryKnownIds,
      }));
      finishReply(abort);
      if (session.get().conflicts.has(chat.id)) return;
      setNotice(
        "Retry was not sent because local storage failed. The conversation remains visible.",
      );
      return;
    }
    await runReply(chat.id, history, prepared, abort);
  };
  const editMessage = async (message: Message) => {
    if (!chat || message.role !== "user" || !canStartReply(chat)) return;
    const saved = await updateChat(chat.id, (current) => ({
      ...current,
      draft: message.content,
      draftAttachments: [...(message.attachments || [])],
      editState: { sourceId: message.id, originalDraft: current.editState?.originalDraft ?? current.draft, originalAttachments: current.editState?.originalAttachments ?? [...(current.draftAttachments || [])] },
    }));
    if (saved) document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };
  const cancelEdit = async () => {
    if (!chat?.editState || !canStartReply(chat)) return;
    const snapshot = chat.editState;
    const saved = await updateChat(chat.id, (current) => ({ ...current, draft: snapshot.originalDraft, draftAttachments: snapshot.originalAttachments, editState: undefined }));
    if (saved) document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };
  const changeBranch = async (messageId: string, deleting = false) => {
    if (!chat || !canStartReply(chat)) return;
    if (chat.editState) { setNotice("Finish or cancel editing before changing branches."); return; }
    if (!chat.messages.some((message) => message.id === messageId)) return;
    session.update({ navigating: true });
    try {
      const selected = deleting ? removeBranch(chat, messageId) : selectBranch(chat, messageId);
      // Keep the old branch visible until the selection/deletion is durable.
      if (await queueSave(selected)) {
        followReply.current = true;
        session.update((current) => ({ threads: current.threads.map((item) => item.id === chat.id ? selected : item) }));
      }
    } finally { session.update({ navigating: false }); }
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
  const storeKey = async () => {
    if (workspaceSignal.aborted) return;
    if (!keyInput) {
      setNotice("Enter a key or token first.");
      return;
    }
    try {
      const destination = credentialDestination(config);
      if (!destination)
        throw new Error(
          "Enter a valid server address before using a credential.",
        );
      if (saveKey) {
        const cipher = await encryptDeviceSecret(keyInput);
        if (workspaceSignal.aborted) return;
        if (config.id === "lmstudio") cipher.destination = destination;
        const saved = await saveSettings((current) => ({
          vaults: { ...current.vaults, [config.id]: cipher },
        }));
        if (!saved || workspaceSignal.aborted) return;
      }
      setSecrets((previous) => ({
        ...previous,
        [config.id]: { destination, value: keyInput },
      }));
      setKeyInput("");
      setNotice(
        saveKey
          ? "Key saved on this device."
          : "Key available for this session only.",
      );
    } catch (e) {
      if (!workspaceSignal.aborted) setNotice(errorText(e));
    }
  };
  const deleteKey = async () => {
    const saved = await saveSettings((current) => {
      const vaults = { ...current.vaults };
      delete vaults[config.id];
      return { vaults };
    });
    if (!saved || workspaceSignal.aborted) return;
    setSecrets((previous) => ({ ...previous, [config.id]: undefined }));
    setKeyInput("");
    setNotice("Saved key removed and session locked.");
  };
  const usage =
    originStorage.usage !== undefined
      ? `${formatSize(originStorage.usage)} used${originStorage.quota === undefined ? "" : ` of approximately ${formatSize(originStorage.quota)}`}`
      : "Unavailable";
  const credentialState:
    "Available for session" | "Saved key unavailable" | "Not set" = credentialFor(
    effective.config,
    secrets[effective.config.id],
  )
    ? "Available for session"
    : settings.vaults[effective.config.id]
      ? "Saved key unavailable"
      : "Not set";
  const hasSessionCredential = Boolean(
    credentialFor(config, secrets[config.id]),
  );
  const hasVault = Boolean(settings.vaults[config.id]);
  const hasLegacyVault = settings.vaults[config.id]?.version === 1;
  const redact = (value?: string) =>
    safeDiagnosticLabel(value, [
      ...Object.values(secrets).map((credential) => credential?.value ?? ""),
      credentialInput?.value ?? "",
    ]);
  const exportData = () => {
    setExportPlan(null);
    try {
      const current = session.get();
      const plan = planBackupExport(current.threads, current.settings);
      if (plan.groups.length === 1 && !plan.tooLarge.length)
        downloadBackup(plan.groups[0].blob, "luma-chat-backup.json");
      else setExportPlan(plan);
      if (plan.omittedServerAddress)
        setNotice(
          "Backup excludes an invalid LM Studio server address. Set a valid address in AI providers.",
        );
    } catch (error) {
      setNotice(errorText(error));
    }
  };
  const importFile = async (file?: File) => {
    if (!file || importing.current || workspaceSignal.aborted) return;
    const selection = ++fileSelection.current;
    setImportPreview(null);
    setImportPreferences(false);
    if (importInput.current) importInput.current.value = "";
    try {
      const value = await readBackupFile(file, undefined, workspaceSignal);
      if (workspaceSignal.aborted || selection !== fileSelection.current)
        return;
      const address = value.settings?.providers?.lmstudio?.endpoint;
      if (address !== undefined && !checkedLmStudioAddress(address))
        setNotice(
          "Invalid LM Studio address in backup. Import will keep the current server address.",
        );
      const ids = new Set(value.conversations.map(({ id }) => id));
      const current = session.get();
      const existing = new Map(
        current.threads.filter((c) => ids.has(c.id)).map((c) => [c.id, c]),
      );
      setImportPreview({
        ...value,
        existing,
        previousSettings: current.settings,
      });
    } catch (e) {
      if (!workspaceSignal.aborted && selection === fileSelection.current)
        setNotice(errorText(e));
    }
  };
  const finishImport = async (overwrite: boolean) => {
    const current = session.get();
    if (
      !importPreview ||
      workspaceSignal.aborted ||
      current.reply ||
      current.processingFiles ||
      current.navigating
    )
      return;
    const preview = importPreview;
    setNotice("Importing backup…");
    importing.current = true;
    session.update({ navigating: true });
    try {
      const selected = preview.conversations.filter(
        (chat) => overwrite || !preview.existing.has(chat.id),
      );
      // Do not manufacture writes to flush an import. A buffered/failed draft
      // is still the user's work, not a durable record we can safely replace.
      if (selected.some(({ id }) => draftTimers.current.has(id))) {
        setNotice(
          "A local edit is still saving. Try the import again after it is saved.",
        );
        return;
      }
      await Promise.all([
        settingsWrite.current,
        ...selected.map(({ id }) => writes.current[id]),
      ]);
      const latest = session.get();
      if (selected.some(({ id }) => latest.replySaves.has(id))) {
        setNotice(
          "Save the local reply before replacing its conversation, or skip conflicts.",
        );
        return;
      }
      const byId = new Map(latest.threads.map((c) => [c.id, c]));
      const records = selected.map((chat) => {
        const previous = preview.existing.get(chat.id);
        if (byId.get(chat.id) !== previous || latest.conflicts.has(chat.id))
          throw new ImportConflictError();
        return {
          previous,
          next: {
            ...portableConversation(chat),
            messages: chat.messages.map(recoverMessage),
          },
        };
      });
      const previous = latest.settings;
      const projects = mergeProjects(previous.projects, preview.projects ?? []);
      const applyPreferences =
        importPreferences && preview.settings !== undefined;
      const changeSettings =
        applyPreferences || projects.length !== previous.projects.length;
      if (changeSettings && preview.previousSettings !== previous)
        throw new ImportConflictError();
      const nextSettings = applyPreferences
        ? mergeSettings(
            {
              ...previous,
              ...preview.settings,
              projects,
              vaults: previous.vaults,
            },
            previous.providers.lmstudio.endpoint,
          )
        : changeSettings
          ? { ...previous, projects }
          : previous;
      const ids = new Set(records.map(({ next }) => next.id));
      const nextThreads = [
        ...records.map(({ next }) => next),
        ...latest.threads.filter((c) => !ids.has(c.id)),
      ];
      const nextActive =
        !latest.active ||
        records.some(({ next }) => next.id === latest.active && next.archived)
          ? mostRecentVisible(nextThreads)
          : latest.active;
      await storage.importBackup({
        records,
        settings: changeSettings ? { previous, next: nextSettings } : undefined,
        active:
          nextActive !== latest.active
            ? { previous: latest.active, next: nextActive }
            : undefined,
      });
      if (
        credentialDestination(previous.providers.lmstudio) !==
        credentialDestination(nextSettings.providers.lmstudio)
      ) {
        setSecrets((current) => ({ ...current, lmstudio: undefined }));
        resetProviderForm();
      }
      session.update({
        threads: nextThreads,
        active: nextActive,
        settings: nextSettings,
      });
      committedSettings.current = nextSettings;
      if (changeSettings) rememberTheme(nextSettings.theme);
      setImportPreview(null);
      setExportPlan(null);
      setNotice(`Imported ${records.length} conversations.`);
    } catch (error) {
      setNotice(
        error instanceof ImportConflictError
          ? "Local data changed since preview. Nothing was imported. Save your work, reload and preview again."
          : "Import failed. Nothing was imported; your existing data and saved keys are unchanged.",
      );
    } finally {
      importing.current = false;
      session.update({ navigating: false });
    }
  };
  const clearData = async () => {
    const current = session.get();
    if (
      current.reply ||
      current.processingFiles ||
      current.navigating ||
      workspaceSignal.aborted ||
      !confirm(
        [
          t(
            "Permanently delete all local chats, attachments, memories, settings, and saved keys?",
          ),
          t(
            "Other open tabs keep their in-memory drafts and keys. Close them to end those sessions.",
          ),
        ].join("\n\n"),
      )
    )
      return;
    // Stop new credential/import work before the first await, not after the
    // delete commits. Already queued writes must settle before the final clear.
    lifetime.abort();
    session.update({ navigating: true });
    setNotice("Clearing local data…");
    try {
      try {
        flushDrafts();
        await Promise.all([
          ...Object.values(writes.current),
          settingsWrite.current,
        ]);
        await storage.clear();
      } catch {
        setNotice(
          "Could not clear local data. Nothing was deleted. Try again.",
        );
        return;
      }
      // Only publish the empty workspace once both stores have committed.
      committedSettings.current = defaultSettings;
      writes.current = Object.create(null);
      session.update({
        threads: [],
        active: "",
        settings: defaultSettings,
        replySaves: new Map(),
        conflicts: new Set(),
      });
      resetProviderForm();
      setSecrets({});
      setProviderObservation(undefined);
      setEditingProvider(defaultSettings.provider);
      setCatalogs({});
      setImportPreview(null);
      setImportPreferences(false);
      if (importInput.current) importInput.current.value = "";
      setExportPlan(null);
      finishHistoryChoice("cancel");
      setSearchMode(null);
      setInspecting(false);
      setDrawer(false);
      rememberTheme(defaultSettings.theme);
      clearSidebarPreferences();
      refreshStorage();
      setNotice("Local data cleared.");
    } finally {
      // New actions get a fresh lifetime even when IndexedDB aborted the clear.
      setLifetime(new AbortController());
      session.update({ navigating: false });
    }
  };
  const toggleSidebar = () =>
    void saveSettings((current) => ({
      sidebarCollapsed: !current.sidebarCollapsed,
    }));
  const removeDraftFile = (fileId: string) => {
    if (chat && !session.get().navigating)
      void updateChat(chat.id, (current) => ({
        ...current,
        draftAttachments: current.draftAttachments?.filter(
          (file) => file.id !== fileId,
        ),
      }));
  };
  const requestPersistence = async () => {
    if (workspaceSignal.aborted) return;
    if (!navigator.storage?.persist) {
      setNotice("Persistent storage is unavailable in this browser.");
      return;
    }
    try {
      const ok = await navigator.storage.persist();
      if (workspaceSignal.aborted) return;
      refreshStorage();
      setNotice(
        ok
          ? "Persistent storage granted."
          : "Persistent storage was not granted; keep backups.",
      );
    } catch {
      if (!workspaceSignal.aborted) setNotice("Could not request persistent storage.");
    }
  };
  let providerStatus = "Provider connection not checked";
  if (!isConfigured) providerStatus = "Setup needed";
  else if (
    providerObservation?.id === config.id &&
    providerObservation.endpoint === config.endpoint &&
    providerObservation.model === config.model &&
    providerObservation.credentialRevision === credentialRevision.current
  ) {
    const labels = {
      connecting: "Connecting to provider",
      succeeded: "Last provider request succeeded",
      catalog: "Model list reachable; chat not checked",
      failed: "Last provider request failed",
    };
    providerStatus = labels[providerObservation.state];
  }
  const preferences: PreferenceProps = {
    locale,
    theme: settings.theme,
    language: settings.language,
    onTheme: (theme) => saveSettings({ theme }),
    onLanguage: (language) => saveSettings({ language }),
  };
  return {
    locale,
    t,
    threads,
    active,
    view,
    working,
    processingFiles,
    navigating,
    clearing: workspaceSignal.aborted,
    desktop,
    mobileDrawer,
    settings: {
      theme: settings.theme,
      language: settings.language,
      sidebarCollapsed: settings.sidebarCollapsed,
      sidebarWidth: settings.sidebarWidth,
      projects: settings.projects,
      provider: settings.provider,
    },
    searchMode,
    setSearchMode,
    drawerToggle,
    settingsHeading,
    importInput,
    messagesContent,
    conversation,
    closeDrawer,
    create,
    choose,
    openSearchResult,
    searchMatch,
    clearSearchMatch,
    openSettings,
    saveSettings,
    organizeChat,
    conflicts: state.conflicts,
    keepConflictCopy,
    replySave,
    retryLocalSave,
    remove,
    saveProject,
    deleteProject,
    toggleSidebar,
    setDrawer,
    chat,
    config,
    providerStatus,
    selectedModel,
    isConfigured,
    checking,
    updateLabel,
    check,
    inspecting,
    setInspecting,
    notice,
    noticeRevision: noticeState.revision,
    setNotice,
    onMessageScroll,
    retry,
    visibleMessages,
    changeBranch,
    editMessage,
    cancelEdit,
    desktopInput,
    displayedDraft,
    phase,
    composerBlocked,
    modelGroups,
    loadCatalog,
    selectModel,
    setView,
    reasoningAvailable,
    reasoningLabel,
    javascriptEnabled,
    toggleJavaScript,
    setReasoning,
    setModelEffort,
    editDraft,
    processFiles,
    removeDraftFile,
    send,
    stopReply,
    showingSettings,
    browseProvider,
    historyTarget,
    finishHistoryChoice,
    toggleConversationConfig,
    updateConfig,
    models,
    showKey,
    keyInput,
    setKeyInput,
    setShowKey,
    saveKey,
    setSaveKey,
    storeKey,
    deleteKey,
    hasSessionCredential,
    hasVault,
    hasLegacyVault,
    testConnection,
    usage,
    requestPersistence,
    exportData,
    exportPlan,
    importFile,
    importPreferences,
    setImportPreferences,
    importPreview,
    finishImport,
    importDestination:
      importPreview?.settings &&
      (() => {
        const next = mergeSettings(
          { ...settings, ...importPreview.settings },
          settings.providers.lmstudio.endpoint,
        ).providers.lmstudio;
        const destination = credentialDestination(next);
        return destination !==
          credentialDestination(settings.providers.lmstudio)
          ? (destination ?? t("Invalid server address"))
          : undefined;
      })(),
    discardImport: () => setImportPreview(null),
    clearData,
    preferences,
    effective,
    activeReply,
    online,
    credentialState,
    effectiveTheme,
    originStorage,
    getBufferedDrafts: () => draftTimers.current.size,
    pwa,
    redact,
  };
}
