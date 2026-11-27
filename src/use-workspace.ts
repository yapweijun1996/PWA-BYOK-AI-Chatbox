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
import { createClearDataAction } from "./workspace-clear";
import { useSettingsPersistence } from "./use-settings-persistence";
import { useModelCatalog } from "./use-model-catalog";
import { createModelActions } from "./workspace-model-actions";
import { formatSize } from "./format-size";
import { readAttachment } from "./attachments";
import { activePath, asBranchConversation, pathTo } from "./branches";
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
  ResolvedConfig,
  RequestSnapshot,
} from "./request-config";
import { useWorkspaceSession, selectActiveChat } from "./workspace-state";
import { useConversationPersistence } from "./use-conversation-persistence";
import { createConversationActions } from "./workspace-conversations";
import { createMessageActions } from "./workspace-message-actions";
import { useConversationScroll } from "./use-conversation-scroll";
import { useBackupState } from "./use-backup-state";
import { createBackupActions, backupImportDestination } from "./backup-actions";
import { resolveLanguage, translate } from "./i18n";
import { ConversationConflictError, storage } from "./storage";
import { SettingsConflictError } from "./settings-edit";
import type { InitialAppState } from "./startup";
import {
  applyTheme,
  readSystemDark,
  resolveTheme,
  subscribeSystemDark,
} from "./theme";
import {
  type HistoryChoice,
} from "./history-sharing";
import { createCredentialActions } from "./credential-manager";
import { useCredentialState } from "./use-credential-state";
import {
  credentialDestination,
  credentialFor,
} from "./credential-destination";
import { defaultSettings, id } from "./types";
import type {
  Attachment,
  Conversation,
  Message,
  ProviderId,
} from "./types";

import type { WorkspaceView as View } from "./settings-sections";
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
  const [noticeState, setNoticeState] = useState({ text: "", revision: 0 });
  const notice = noticeState.text;
  const setNotice = useCallback((value: React.SetStateAction<string>) => {
    setNoticeState((previous) => ({
      text: typeof value === "function" ? value(previous.text) : value,
      revision: previous.revision + 1,
    }));
  }, []);
  const credentials = useCredentialState(settings, session, workspaceSignal, setNotice);
  const { secrets, credentialInput, credentialRevision, saveKey, setSaveKey, showKey, setShowKey, remember, clearCredentials, resetProviderForm, inputFor, setInputFor } = credentials;
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
  const prepareUpdate = useRef<() => Promise<boolean>>(async () => false);
  const pwa = useAppUpdate(setNotice, () => prepareUpdate.current());
  const { checking, check } = pwa;
  const updateLabel = `${t("Check for updates")} · v${version}`;
  const working = activeReply !== null;
  const [online, setOnline] = useState(() => navigator.onLine);
  const [providerObservation, setProviderObservation] = useState<ProviderObservation>();
  const providerObservationSequence = useRef(0);
  const { info: originStorage, refresh: refreshStorage } = useOriginStorage(
    view === "data" || inspecting,
  );
  const backup = useBackupState(view);
  const { exportPlan, importPreview, importPreferences, setImportPreferences, importing, importInput, resetBackup } = backup;
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
  const { settingsWrite, committedSettings, queuePreferenceWrite, saveSettings } = useSettingsPersistence({
    initial: initial.settings, session, importing, signal: workspaceSignal, report,
    forgetLmStudio: () => { remember("lmstudio"); resetProviderForm(); },
  });
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
  const keyInput = inputFor(config);
  const setKeyInput = (value: string) => setInputFor(config, value);
  const { catalogs, setCatalogs, modelGroups, models, selectedModel, reasoningAvailable, reasoningLabel } = useModelCatalog(settings, config, t);
  const displayedDraft =
    activeReply?.phase === "saving" && activeReply.draft?.id === active
      ? activeReply.draft
      : chat;
  const files = chat?.draftAttachments || [];
  const hasImage = (attachments?: Attachment[]) =>
    attachments?.some((file) => file.mime.startsWith("image/"));
  const visibleMessages = useMemo(() => chat ? activePath(chat) : [], [chat?.id, chat?.messages, chat?.branchVersion, chat?.activeMessageId]);
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
  const { messagesContent, conversation, followReply, onMessageScroll, showJumpToLatest, jumpToLatest } = useConversationScroll(active, view, hasMessages);
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
  const { browseProvider, openProvider, openSettings, updateConfig, toggleConversationConfig, selectModel, loadCatalog, setModelEffort, setReasoning, testConnection } = createModelActions({
    settings, config, effective, view, chat, editingProvider, setEditingProvider, setDrawer, setView,
    session, signal: workspaceSignal, resetProviderForm, saveSettings, updateChat, secrets, setCatalogs,
    credentialRevision, providerObservationSequence, setProviderObservation, keyInput, notify: setNotice,
  });
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
  const { send, retry, editMessage, cancelEdit, changeBranch } = createMessageActions({
    session, chat, settings, files, effective, draftHistory, isConfigured, sendBlocked,
    blockedFor, configured, canStartReply, askToShareHistory, followReply, prepareReply,
    beginReply, updateChat, queueSave, finishReply, runReply, setNotice, openProvider,
  });
  const { storeKey, deleteKey } = createCredentialActions({
    config, input: keyInput, saveOnDevice: saveKey, signal: workspaceSignal, saveSettings,
    remember, clearInput: () => setKeyInput(""), notify: setNotice,
  });
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
  const { exportData, importFile, finishImport } = createBackupActions({
    session, backup, persistence, signal: workspaceSignal, settingsWrite, committedSettings,
    remember, resetProviderForm, notify: setNotice,
  });
  const clearData = createClearDataAction({
    session, lifetime, persistence, settingsWrite, committedSettings, refreshStorage, notify: setNotice, t,
    resetLifetime: () => setLifetime(new AbortController()),
    resetVisibleState: () => {
      resetProviderForm();
      clearCredentials();
      setProviderObservation(undefined);
      setEditingProvider(defaultSettings.provider);
      setCatalogs({});
      resetBackup();
      finishHistoryChoice("cancel");
      setSearchMode(null);
      setInspecting(false);
      setDrawer(false);
    },
  });
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
    followReply,
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
    showJumpToLatest,
    jumpToLatest,
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
    importDestination: backupImportDestination(settings, importPreview, t),
    discardImport: () => backup.setImportPreview(null),
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
