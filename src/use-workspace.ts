import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { version } from "../package.json";
import type { SearchMode } from "./components/WorkspaceSearch";
import type { ChatOrganization } from "./components/WorkspaceActions";
import { mergeProjects, mostRecentVisible } from "./workspace";
import { canRequestReasoning, configureModel } from "./model-options";
import type { ModelOption } from "./model-options";
import { formatSize } from "./format-size";
import { readAttachment } from "./attachments";
import { copyConversationSelection } from "./message-copy";
import type { PreferenceProps } from "./components/Preferences";
import type { ReplyPhase } from "./components/Composer";
import { safeDiagnosticLabel, useOriginStorage } from "./workspace-inspection";
import { createResponseTracker, responseIdentity } from "./response-telemetry";
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
import { resolveLanguage, translate } from "./i18n";
import { storage } from "./storage";
import type { InitialAppState } from "./startup";
import {
  applyTheme,
  rememberTheme,
  resolveTheme,
  systemThemeQuery,
} from "./theme";
import { mergeSettings, recoverMessage, validBackup } from "./data-contracts";
import { runToolTurn } from "./tool-turn";
import type { ToolExecution } from "./javascript-tool";
import { decryptSecret, encryptSecret } from "./crypto";
import { listModelOptions, streamChat } from "./providers";
import { defaultSettings, id, providerIds as providers } from "./types";
import type {
  Attachment,
  Conversation,
  Message,
  ProviderId,
  Settings as AppSettings,
  WorkspaceProject,
} from "./types";

export const settingsSections = [
  ["providers", "AI providers"],
  ["appearance", "Appearance"],
  ["data", "Local data"],
] as const;
type View = "chat" | (typeof settingsSections)[number][0];
type Secrets = Partial<Record<ProviderId, string>>;
const emptyChat = (): Conversation => ({
  id: id(),
  title: "New chat",
  updatedAt: Date.now(),
  messages: [],
  draft: "",
});
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
  const {
    threads,
    active,
    settings,
    reply: activeReply,
    processingFiles,
  } = state;
  const phase: ReplyPhase = activeReply?.phase ?? "idle";
  const [systemLanguage, setSystemLanguage] = useState(
    () => navigator.language,
  );
  const locale = resolveLanguage(settings.language, systemLanguage);
  const t = (text: string) => translate(locale, text);
  const [secrets, setSecrets] = useState<Secrets>({});
  const [view, setView] = useState<View>("chat");
  const [drawer, setDrawer] = useState(false);
  const [desktop, setDesktop] = useState(
    () => matchMedia("(min-width: 768px)").matches,
  );
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [armedChat, setArmedChat] = useState<string>();
  const javascriptEnabled = Boolean(active && active === armedChat);
  const toggleJavaScript = () => {
    if (!active || session.get().reply) return;
    setArmedChat(javascriptEnabled ? undefined : active);
    setNotice(
      javascriptEnabled
        ? "JavaScript tool disabled for the next reply."
        : "JavaScript enabled for the next reply. Code runs locally; results go to the selected provider.",
    );
  };
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState("");
  const pwa = useAppUpdate(setNotice);
  const { checking, check } = pwa;
  const updateLabel = `${t("Check for updates")} · v${version}`;
  const working = activeReply !== null;
  const [online, setOnline] = useState(() => navigator.onLine);
  const [catalogs, setCatalogs] = useState<
    Partial<Record<ProviderId, { endpoint: string; options: ModelOption[] }>>
  >({});
  const [password, setPassword] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [saveKey, setSaveKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const { info: originStorage, refresh: refreshStorage } = useOriginStorage(
    view === "data" || inspecting,
  );
  const [importPreview, setImportPreview] = useState<{
    conversations: Conversation[];
    settings?: Partial<AppSettings>;
    projects?: WorkspaceProject[];
  } | null>(null);
  const draftTimers = useRef(new Map<string, number>());
  const writes = useRef<Record<string, Promise<void>>>({});
  const messagesContent = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLElement>(null);
  const lastScrollTop = useRef(0);
  const followReply = useRef(true);
  const importInput = useRef<HTMLInputElement>(null);
  const report = useCallback(
    (error: unknown) =>
      setNotice(
        `Storage error: ${errorText(error)} Your visible work is retained; export it before reloading.`,
      ),
    [],
  );
  const queueSave = useCallback(
    (chat: Conversation) => {
      const timer = draftTimers.current.get(chat.id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        draftTimers.current.delete(chat.id);
      }
      const previous = writes.current[chat.id] || Promise.resolve();
      const write = previous
        .catch(() => {})
        .then(() => storage.saveConversation(chat));
      writes.current[chat.id] = write.catch(report);
      return write.then(
        () => true,
        () => false,
      );
    },
    [report],
  );
  const updateChat = useCallback(
    (chatId: string, fn: (c: Conversation) => Conversation, persist = true) => {
      let changed: Conversation | undefined;
      const next = session.get().threads.map((c) => {
        if (c.id !== chatId) return c;
        changed = fn(c);
        return changed;
      });
      if (changed) session.update({ threads: next });
      return changed && persist ? queueSave(changed) : Promise.resolve(true);
    },
    [queueSave, session],
  );
  const flushDraft = useCallback(
    (chatId: string) => {
      const timer = draftTimers.current.get(chatId);
      if (timer === undefined) return;
      window.clearTimeout(timer);
      draftTimers.current.delete(chatId);
      const latest = session.get().threads.find((chat) => chat.id === chatId);
      if (latest) void queueSave(latest);
    },
    [queueSave, session],
  );
  const flushDrafts = useCallback(() => {
    for (const chatId of draftTimers.current.keys()) flushDraft(chatId);
  }, [flushDraft]);
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
  const [systemDark, setSystemDark] = useState(
    () => matchMedia(systemThemeQuery).matches,
  );
  const effectiveTheme = resolveTheme(settings.theme, systemDark);
  useLayoutEffect(() => {
    const media = matchMedia(systemThemeQuery);
    const change = () => setSystemDark(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => applyTheme(effectiveTheme), [effectiveTheme]);
  const settingsWrite = useRef<Promise<void>>(Promise.resolve());
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
        document.querySelector("dialog[open]")
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
  const openSettings = () => {
    setDrawer(false);
    setView("providers");
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
    const previous = session.get().settings;
    const next = {
      ...previous,
      ...(typeof change === "function" ? change(previous) : change),
    };
    session.update({ settings: next });
    const saved = await queuePreferenceWrite(async () => {
      await storage.saveSettings(next);
      rememberTheme(next.theme);
    });
    if (!saved && session.get().settings === next)
      session.update({ settings: previous });
    return saved;
  };
  const selectActive = (chatId: string) => {
    session.update({ active: chatId });
    void queuePreferenceWrite(() => storage.saveActiveConversation(chatId));
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
      ? settings.providers[settings.provider]
      : effective.config;
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
  const historyHasImages = chat?.messages.some((message) =>
    hasImage(message.attachments),
  );
  const blockedFor = (target: ResolvedConfig["config"]) =>
    !online && target.id !== "lmstudio"
      ? offlineNotice
      : !target.vision && historyHasImages
        ? imageSupportNotice
        : undefined;
  const sendBlocked =
    blockedFor(effective.config) ||
    (!effective.config.vision && hasImage(files)
      ? imageSupportNotice
      : undefined);
  const hasMessages = Boolean(chat?.messages.length);
  useLayoutEffect(() => {
    const pane = conversation.current;
    const content = messagesContent.current;
    if (view !== "chat" || !hasMessages || !pane || !content) return;
    const keepBottom = () => {
      if (followReply.current) pane.scrollTop = pane.scrollHeight;
      lastScrollTop.current = pane.scrollTop;
    };
    keepBottom();
    const observer = new ResizeObserver(keepBottom);
    observer.observe(content);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [active, view, hasMessages]);
  useLayoutEffect(onInitialCommit, [onInitialCommit]);
  useEffect(() => {
    const copy = (event: ClipboardEvent) => {
      const list = messagesContent.current;
      const current = selectActiveChat(session.get());
      if (list && current)
        copyConversationSelection(event, list, current.messages);
    };
    document.addEventListener("copy", copy);
    return () => document.removeEventListener("copy", copy);
  }, [session]);
  const configured = (target: ResolvedConfig["config"]) =>
    !!target.model.trim() && (target.id === "lmstudio" || !!secrets[target.id]);
  const isConfigured = configured(effective.config);
  const desktopInput = desktop && matchMedia("(pointer: fine)").matches;
  const hasDraft = Boolean(chat?.draft.trim() || files.length);
  const composerBlocked =
    sendBlocked || (hasDraft && !isConfigured ? setupNotice : undefined);
  const editDraft = (draft: string) => {
    if (!chat || phase === "saving") return;
    const chatId = chat.id;
    void updateChat(chatId, (current) => ({ ...current, draft }), false);
    const pending = draftTimers.current.get(chatId);
    if (pending !== undefined) window.clearTimeout(pending);
    draftTimers.current.set(
      chatId,
      window.setTimeout(() => flushDraft(chatId), 350),
    );
  };
  const create = () => {
    flushDraft(active);
    followReply.current = true;
    const next = emptyChat();
    session.update((current) => ({ threads: [next, ...current.threads] }));
    queueSave(next);
    selectActive(next.id);
    setView("chat");
    if (mobileDrawer) closeDrawer();
  };
  const choose = (chatId: string) => {
    flushDraft(active);
    followReply.current = true;
    selectActive(chatId);
    setView("chat");
    if (mobileDrawer) closeDrawer();
  };
  const remove = async (chatId: string) => {
    if (
      session.get().reply ||
      session.get().processingFiles ||
      !confirm(t("Delete this conversation and its saved attachments?"))
    )
      return;
    flushDraft(chatId);
    await writes.current[chatId]?.catch(() => {});
    try {
      await storage.removeConversation(chatId);
      const next = session.get().threads.filter((c) => c.id !== chatId);
      session.update({ threads: next });
      if (session.get().active === chatId)
        selectActive(mostRecentVisible(next));
    } catch (e) {
      report(e);
    }
  };
  const organizeChat = (chatId: string, patch: ChatOrganization) => {
    void updateChat(chatId, (current) => ({ ...current, ...patch }));
    if (patch.archived && active === chatId) {
      followReply.current = true;
      selectActive(mostRecentVisible(session.get().threads, chatId));
    }
  };
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
      organizeChat(chatId, { projectId: key });
  };
  const deleteProject = (projectId: string) => {
    if (
      session
        .get()
        .threads.some((conversation) => conversation.projectId === projectId)
    )
      return;
    void saveSettings((current) => ({
      projects: current.projects.filter((project) => project.id !== projectId),
    }));
  };
  const resetProviderForm = () => {
    setKeyInput("");
    setPassword("");
    setSaveKey(false);
    setShowKey(false);
  };
  const setProvider = (provider: ProviderId) => {
    resetProviderForm();
    void saveSettings({ provider });
  };
  const updateConfig = (patch: Partial<typeof config>) =>
    saveSettings((current) => ({
      providers: {
        ...current.providers,
        [config.id]: { ...current.providers[config.id], ...patch },
      },
    }));
  const setConversationConfig = (override?: RequestOverrides) => {
    if (chat)
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
    if (provider !== settings.provider) resetProviderForm();
    void saveSettings((current) => ({
      provider,
      providers: {
        ...current.providers,
        [provider]: configureModel(current.providers[provider], option),
      },
    }));
  };
  const loadCatalog = async (provider: ProviderId, keyOverride?: string) => {
    const target = settings.providers[provider];
    const options = await listModelOptions(
      target,
      keyOverride || secrets[provider] || "",
    );
    setCatalogs((current) => ({
      ...current,
      [provider]: { endpoint: target.endpoint, options },
    }));
    return options;
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
      secret: secrets[target.id] || "",
    };
  };
  const runReply = async (
    chatId: string,
    history: Message[],
    prepared: ReturnType<typeof prepareReply>,
    abort: AbortController,
  ) => {
    const current = session.get().reply;
    if (current?.controller !== abort) return;
    session.update({ reply: { ...current, phase: "streaming", draft: null } });
    setNotice("");
    let content = "";
    let reasoning = "";
    let tracker = createResponseTracker(prepared.telemetry, prepared.pricing);
    let roundTelemetry: ReturnType<typeof tracker.snapshot> | undefined;
    let executions: ToolExecution[] = [];
    let lastCheckpoint = performance.now();
    const publish = (
      status: NonNullable<Message["status"]>,
      persist: boolean,
    ) => {
      if (!isCurrentReply(abort)) return;
      const telemetry = roundTelemetry ?? tracker.snapshot();
      void updateChat(
        chatId,
        (c) => ({
          ...c,
          ...(status === "complete" ? { updatedAt: Date.now() } : {}),
          messages: c.messages.map((m) =>
            m.id === prepared.message.id
              ? {
                  ...m,
                  content,
                  reasoning,
                  status,
                  telemetry,
                  ...(executions.length ? { toolExecutions: executions } : {}),
                }
              : m,
          ),
        }),
        persist,
      );
    };
    const publishStream = () => {
      const now = performance.now();
      const checkpoint = now - lastCheckpoint >= 500;
      if (checkpoint) lastCheckpoint = now;
      publish("streaming", checkpoint);
    };
    const timer = window.setInterval(() => {
      if (!abort.signal.aborted) publish("streaming", false);
    }, 500);
    try {
      await runToolTurn(
        async (tool) => {
          tracker = createResponseTracker(prepared.telemetry, prepared.pricing);
          roundTelemetry = undefined;
          let firstText = true;
          let firstReasoning = true;
          const round = await streamChat(
            prepared.target,
            prepared.secret,
            history,
            abort.signal,
            (text) => {
              if (!isCurrentReply(abort) || abort.signal.aborted) return;
              tracker.visible(text);
              if (firstText && content) content += "\n\n";
              firstText = false;
              content += text;
              publishStream();
            },
            (text) => {
              if (!isCurrentReply(abort) || abort.signal.aborted) return;
              if (firstReasoning && reasoning) reasoning += "\n\n";
              firstReasoning = false;
              reasoning += text;
              publishStream();
            },
            (sample, receivedAt) => {
              if (
                isCurrentReply(abort) &&
                !abort.signal.aborted &&
                tracker.receive(sample, receivedAt)
              )
                publishStream();
            },
            tool,
          );
          roundTelemetry = tracker.snapshot();
          return round;
        },
        prepared.request.javascript === true,
        abort.signal,
        (record) => {
          if (!isCurrentReply(abort)) return;
          executions = executions.some(({ id }) => id === record.id)
            ? executions.map((prior) =>
                prior.id === record.id ? record : prior,
              )
            : [...executions, record];
          publish("streaming", true);
        },
      );
      publish(abort.signal.aborted ? "interrupted" : "complete", true);
    } catch (e) {
      if (!isCurrentReply(abort)) return;
      const stopped = abort.signal.aborted;
      publish(stopped ? "interrupted" : "error", true);
      if (!stopped) setNotice(errorText(e));
    } finally {
      window.clearInterval(timer);
      finishReply(abort);
    }
  };
  const send = async () => {
    if (session.get().reply || session.get().processingFiles) return;
    if (!chat) {
      setNotice("Start a new chat first.");
      return;
    }
    if (!chat.draft.trim() && !files.length) return;
    if (!isConfigured) {
      setNotice(
        "Choose a model and enter your key in Providers. LM Studio does not require a key unless authentication is enabled.",
      );
      setView("providers");
      return;
    }
    if (sendBlocked) {
      setNotice(sendBlocked);
      return;
    }
    followReply.current = true;
    const user: Message = {
      id: id(),
      role: "user",
      content: chat.draft,
      attachments: files,
      createdAt: Date.now(),
      status: "complete",
    };
    const history = [...chat.messages, user];
    const prepared = prepareReply(effective, history);
    const reply = prepared.message;
    const chatId = chat.id;
    const nextTitle =
      chat.title === "New chat"
        ? chat.draft.trim().slice(0, 60) || files[0]?.name || "New chat"
        : chat.title;
    const abort = beginReply(chatId, prepared.request, chat);
    const saved = await updateChat(chatId, (c) => ({
      ...c,
      title: nextTitle,
      draft: "",
      draftAttachments: [],
      updatedAt: Date.now(),
      messages: [...c.messages, user, reply],
    }));
    if (!saved) {
      updateChat(chatId, (c) => ({
        ...c,
        title: c.title === nextTitle ? chat.title : c.title,
        draft: c.draft ? `${user.content}\n${c.draft}` : user.content,
        draftAttachments: [
          ...(user.attachments || []),
          ...(c.draftAttachments || []),
        ],
        messages: c.messages.filter(
          (m) => m.id !== user.id && m.id !== reply.id,
        ),
      }));
      finishReply(abort);
      setNotice(
        "Message was not sent because local storage failed. Your draft and attachments are still visible.",
      );
      return;
    }
    if (prepared.request.javascript) setArmedChat(undefined);
    await runReply(chatId, history, prepared, abort);
  };
  const retry = async (original?: RequestSnapshot) => {
    if (!chat || session.get().reply || session.get().processingFiles) return;
    const resolved = original
      ? resolveConfig(
          settings,
          chat.configOverride,
          profileOverride({ ...original, id: original.provider }),
        )
      : effective;
    const blocked = blockedFor(resolved.config);
    if (blocked) {
      setNotice(blocked);
      return;
    }
    if (!configured(resolved.config)) {
      setNotice("Choose a model and unlock its key in Providers.");
      setView("providers");
      return;
    }
    if (
      !confirm(
        t(
          "Retry sends a new request to the selected provider and may incur charges. Continue?",
        ),
      )
    )
      return;
    const prepared = prepareReply(resolved, chat.messages);
    const reply = prepared.message;
    const abort = beginReply(chat.id, prepared.request, null);
    const saved = await updateChat(chat.id, (c) => ({
      ...c,
      messages: [...c.messages, reply],
      updatedAt: Date.now(),
    }));
    if (!saved) {
      updateChat(chat.id, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== reply.id),
      }));
      finishReply(abort);
      setNotice(
        "Retry was not sent because local storage failed. The conversation remains visible.",
      );
      return;
    }
    if (prepared.request.javascript) setArmedChat(undefined);
    await runReply(chat.id, chat.messages, prepared, abort);
  };
  const testConnection = async () => {
    try {
      setNotice("Connecting…");
      const result = await loadCatalog(config.id, keyInput);
      setNotice(
        result.length
          ? `Model list loaded (${result.length}). This does not verify your key or chat access. Select one or enter its ID.`
          : "Model list loaded but no models were listed. This does not verify your key or chat access; enter a model ID manually.",
      );
    } catch (e) {
      setNotice(errorText(e));
    }
  };
  const storeKey = async () => {
    if (!keyInput) {
      setNotice("Enter a key or token first.");
      return;
    }
    try {
      if (saveKey) {
        if (!password) throw new Error("Enter an unlock password.");
        const cipher = await encryptSecret(keyInput, password);
        const saved = await saveSettings((current) => ({
          vaults: { ...current.vaults, [config.id]: cipher },
        }));
        if (!saved) return;
      }
      setSecrets((previous) => ({ ...previous, [config.id]: keyInput }));
      setKeyInput("");
      setPassword("");
      setNotice(
        saveKey
          ? "Key encrypted and unlocked on this device."
          : "Key available for this session only.",
      );
    } catch (e) {
      setNotice(errorText(e));
    }
  };
  const unlock = async () => {
    const vault = settings.vaults[config.id];
    if (!vault) return;
    try {
      const secret = await decryptSecret(vault, password);
      setSecrets((previous) => ({ ...previous, [config.id]: secret }));
      setPassword("");
      setNotice("Key unlocked for this session.");
    } catch (e) {
      setNotice(errorText(e));
    }
  };
  const deleteKey = async () => {
    const saved = await saveSettings((current) => {
      const vaults = { ...current.vaults };
      delete vaults[config.id];
      return { vaults };
    });
    if (!saved) return;
    setSecrets((previous) => ({ ...previous, [config.id]: undefined }));
    setKeyInput("");
    setPassword("");
    setNotice("Saved key removed and session locked.");
  };
  const usage =
    originStorage.usage !== undefined
      ? `${formatSize(originStorage.usage)} used${originStorage.quota === undefined ? "" : ` of approximately ${formatSize(originStorage.quota)}`}`
      : "Unavailable";
  const credentialState:
    "Available for session" | "Saved and locked" | "Not set" = secrets[
    effective.config.id
  ]
    ? "Available for session"
    : settings.vaults[effective.config.id]
      ? "Saved and locked"
      : "Not set";
  const hasSessionCredential = Boolean(secrets[config.id]);
  const hasVault = Boolean(settings.vaults[config.id]);
  const redact = (value?: string) =>
    safeDiagnosticLabel(value, [...Object.values(secrets), keyInput, password]);
  const exportData = () => {
    const { vaults: _vaults, projects, ...safeSettings } = settings;
    void _vaults;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            conversations: session.get().threads,
            projects,
            settings: safeSettings,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "luma-chat-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("Backup exceeds the 100 MB import limit.");
      const value: unknown = JSON.parse(await file.text());
      if (!validBackup(value))
        throw new Error("Invalid or unsupported backup file.");
      setImportPreview(value);
    } catch (e) {
      setNotice(errorText(e));
    }
    if (importInput.current) importInput.current.value = "";
  };
  const finishImport = async (overwrite: boolean) => {
    if (!importPreview || session.get().reply || session.get().processingFiles)
      return;
    const {
      settings: importSettings,
      projects: importProjects = [],
      conversations: importData,
    } = importPreview;
    let imported = 0;
    try {
      const existing = new Set(session.get().threads.map((c) => c.id));
      for (const c of importData) {
        if (existing.has(c.id) && !overwrite) continue;
        const clean = {
          ...c,
          messages: c.messages.map(recoverMessage),
        };
        flushDraft(c.id);
        await writes.current[c.id]?.catch(() => {});
        await storage.saveConversation(clean);
        session.update((current) => ({
          threads: [clean, ...current.threads.filter((x) => x.id !== clean.id)],
        }));
        existing.add(c.id);
        imported++;
      }
      if (!session.get().active)
        selectActive(mostRecentVisible(session.get().threads));
      const latest = session.get().settings;
      const projects = mergeProjects(latest.projects, importProjects);
      const importPreferences =
        importSettings &&
        confirm(
          t(
            "Import appearance and provider settings? Saved keys will remain on this device.",
          ),
        );
      if (importPreferences || projects.length !== latest.projects.length) {
        const merged = mergeSettings({
          ...latest,
          ...(importPreferences ? importSettings : {}),
          projects,
          vaults: latest.vaults,
        });
        if (!(await saveSettings(merged))) return;
      }
      setNotice(`Imported ${imported} conversations.`);
      setImportPreview(null);
    } catch (e) {
      report(e);
    }
  };
  const clearData = async () => {
    if (
      session.get().reply ||
      session.get().processingFiles ||
      !confirm(
        t(
          "Permanently delete all local chats, attachments, settings, and saved keys?",
        ),
      )
    )
      return;
    try {
      flushDrafts();
      await Promise.all([
        ...Object.values(writes.current),
        settingsWrite.current,
      ]);
      await storage.clear();
      session.update({ threads: [], active: "", settings: defaultSettings });
      setCatalogs({});
      rememberTheme(defaultSettings.theme);
      setSecrets({});
      setNotice("Local data cleared.");
    } catch (e) {
      report(e);
    }
  };
  const toggleSidebar = () =>
    void saveSettings((current) => ({
      sidebarCollapsed: !current.sidebarCollapsed,
    }));
  const onMessageScroll = () => {
    const el = conversation.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap <= 2) followReply.current = true;
    else if (el.scrollTop !== lastScrollTop.current)
      followReply.current = false;
    lastScrollTop.current = el.scrollTop;
  };
  const removeDraftFile = (fileId: string) => {
    if (chat)
      void updateChat(chat.id, (current) => ({
        ...current,
        draftAttachments: current.draftAttachments?.filter(
          (file) => file.id !== fileId,
        ),
      }));
  };
  const lockKey = () => {
    setSecrets((current) => ({ ...current, [config.id]: undefined }));
    setNotice("Key locked for this session.");
  };
  const requestPersistence = async () => {
    if (!navigator.storage?.persist) {
      setNotice("Persistent storage is unavailable in this browser.");
      return;
    }
    try {
      const ok = await navigator.storage.persist();
      refreshStorage();
      setNotice(
        ok
          ? "Persistent storage granted."
          : "Persistent storage was not granted; keep backups.",
      );
    } catch {
      setNotice("Could not request persistent storage.");
    }
  };
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
    openSettings,
    saveSettings,
    organizeChat,
    remove,
    saveProject,
    deleteProject,
    toggleSidebar,
    setDrawer,
    chat,
    config,
    selectedModel,
    isConfigured,
    checking,
    updateLabel,
    check,
    inspecting,
    setInspecting,
    notice,
    setNotice,
    onMessageScroll,
    retry,
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
    editDraft,
    processFiles,
    removeDraftFile,
    send,
    stopReply,
    showingSettings,
    setProvider,
    toggleConversationConfig,
    updateConfig,
    models,
    showKey,
    keyInput,
    setKeyInput,
    setShowKey,
    saveKey,
    setSaveKey,
    password,
    setPassword,
    storeKey,
    unlock,
    deleteKey,
    hasSessionCredential,
    hasVault,
    lockKey,
    testConnection,
    usage,
    requestPersistence,
    exportData,
    importFile,
    importPreview,
    finishImport,
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
