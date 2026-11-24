import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  Menu,
  Paperclip,
  Sparkles,
  ArrowLeft,
  Trash2,
  Download,
  Upload,
  Copy,
  ChevronDown,
  RefreshCw,
  Brain,
} from "lucide-react";
import { version } from "../package.json";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import type { ReplyPhase } from "./components/Composer";
import { ModelSelector } from "./components/ModelSelector";
import { canRequestReasoning, compactModelName, configureModel } from "./model-options";
import type { ModelOption } from "./model-options";
import { formatSize } from "./format-size";
import { readAttachment } from "./attachments";
import { PreferenceFields, TopbarPreferences } from "./components/Preferences";
import type { PreferenceProps } from "./components/Preferences";
import { Toast } from "./components/Toast";
import { ResponseInspector } from "./components/ResponseInspector";
import { createResponseTracker, responseIdentity } from "./response-telemetry";
import { useAppUpdate } from "./pwa-update";
import {
  interpolate,
  resolveLanguage,
  translate,
  translateNotice,
} from "./i18n";
import type { Locale } from "./i18n";
import { storage } from "./storage";
import { mergeSettings, validBackup } from "./data-contracts";
import { decryptSecret, encryptSecret } from "./crypto";
import { listModelOptions, streamChat } from "./providers";
import { defaultSettings, id, labels, providerIds as providers } from "./types";
import type {
  Attachment,
  Conversation,
  Message,
  ProviderId,
  Settings as AppSettings,
} from "./types";
import "./generated/tokens-light.css";
import "./generated/tokens-dark.css";
import "./styles.css";

type View = "chat" | "providers" | "data" | "appearance";
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
function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(
    marked.parse(text, { async: false }) as string,
    {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["img", "iframe", "form", "style"],
    },
  );
  return (
    <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
function Reasoning({
  text,
  streaming,
  locale,
}: {
  text: string;
  streaming: boolean;
  locale: Locale;
}) {
  const [open, setOpen] = useState(true);
  const t = (text: string) => translate(locale, text);
  return (
    <details
      className="reasoning"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{streaming ? t("Thinking…") : t("Reasoning")}</summary>
      <Markdown text={text} />
    </details>
  );
}
function App() {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const threadsRef = useRef<Conversation[]>([]);
  const [active, setActive] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
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
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const { checking, check } = useAppUpdate(setNotice);
  const updateLabel = `${t("Check for updates")} · v${version}`;
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<ReplyPhase>("idle");
  const working = phase !== "idle";
  const [online, setOnline] = useState(() => navigator.onLine);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [catalogs, setCatalogs] = useState<Partial<Record<ProviderId, { endpoint: string; options: ModelOption[] }>>>({});
  const [password, setPassword] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [saveKey, setSaveKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [usage, setUsage] = useState("Unavailable");
  const [importData, setImportData] = useState<Conversation[] | null>(null);
  const [importSettings, setImportSettings] = useState<
    Partial<AppSettings> | undefined
  >();
  const controller = useRef<AbortController | null>(null);
  const submittedDraft = useRef<Conversation | null>(null);
  const attachmentJob = useRef(false);
  const draftTimers = useRef(new Map<string, number>());
  const writes = useRef<Record<string, Promise<void>>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLElement>(null);
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
      const next = threadsRef.current.map((c) => {
        if (c.id !== chatId) return c;
        changed = fn(c);
        return changed;
      });
      threadsRef.current = next;
      setThreads(next);
      return changed && persist ? queueSave(changed) : Promise.resolve(true);
    },
    [queueSave],
  );
  const flushDraft = useCallback((chatId: string) => {
    const timer = draftTimers.current.get(chatId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    draftTimers.current.delete(chatId);
    const latest = threadsRef.current.find((chat) => chat.id === chatId);
    if (latest) void queueSave(latest);
  }, [queueSave]);
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
  useEffect(() => {
    let alive = true;
    Promise.all([storage.conversations(), storage.settings()])
      .then(([stored, saved]) => {
        if (!alive) return;
        const recovered = stored.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.status === "streaming"
              ? { ...m, status: "interrupted" as const }
              : m,
          ),
        }));
        recovered.sort((a, b) => b.updatedAt - a.updatedAt);
        threadsRef.current = recovered;
        setThreads(recovered);
        setActive(recovered[0]?.id || "");
        setSettings(mergeSettings(saved));
        recovered.forEach((c) => {
          if (c.messages.some((m) => m.status === "interrupted")) queueSave(c);
        });
      })
      .catch(report)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [queueSave, report]);
  useEffect(() => {
    const theme =
      settings.theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : settings.theme;
    document.documentElement.dataset.theme = theme;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      if (settings.theme === "system")
        document.documentElement.dataset.theme = media.matches
          ? "dark"
          : "light";
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [settings.theme]);
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
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const saveSettings = (next: AppSettings) => {
    setSettings(next);
    const write = settingsWrite.current.then(() => storage.saveSettings(next));
    settingsWrite.current = write.catch(report);
    return write.then(
      () => true,
      () => false,
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
  const config = settings.providers[settings.provider];
  const modelGroups = useMemo(() => providers.map((provider) => {
    const { model, endpoint } = settings.providers[provider];
    const catalog = catalogs[provider];
    const options = catalog?.endpoint === endpoint ? catalog.options : [];
    return { provider, options: model && !options.some(({ id }) => id === model) ? [{ id: model }, ...options] : options };
  }), [catalogs, settings.providers]);
  const models = modelGroups.find(({ provider }) => provider === config.id)?.options || [];
  const selectedModel = models.find(({ id }) => id === config.model);
  const reasoningAvailable = Boolean(selectedModel) && canRequestReasoning(config.id) && (
    selectedModel?.reasoning === true || config.reasoningSupported === true || config.requestThoughts === true
  );
  const reasoningLabel = t(config.id === "gemini" ? "Request thought summaries" : "Request reasoning");
  const chat = threads.find((c) => c.id === active);
  const displayedDraft = phase === "saving" && submittedDraft.current?.id === active
    ? submittedDraft.current
    : chat;
  const files = chat?.draftAttachments || [];
  const hasImage = (attachments?: Attachment[]) =>
    attachments?.some((file) => file.mime.startsWith("image/"));
  const historyHasImages = chat?.messages.some((message) => hasImage(message.attachments));
  const replyBlocked = !online && config.id !== "lmstudio" ? offlineNotice
    : !config.vision && historyHasImages ? imageSupportNotice : undefined;
  const sendBlocked = replyBlocked || (!config.vision && hasImage(files) ? imageSupportNotice : undefined);
  const lastMessage = chat?.messages[chat.messages.length - 1];
  useEffect(() => {
    if (view === "chat" && followReply.current) {
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [
    lastMessage?.id,
    lastMessage?.content,
    lastMessage?.reasoning,
    lastMessage?.status,
    active,
    view,
  ]);
  const isConfigured =
    !!config.model.trim() && (config.id === "lmstudio" || !!secrets[config.id]);
  const desktopInput = desktop && matchMedia("(pointer: fine)").matches;
  const hasDraft = Boolean(chat?.draft.trim() || files.length);
  const composerBlocked = sendBlocked || (hasDraft && !isConfigured ? setupNotice : undefined);
  const editDraft = (draft: string) => {
    if (!chat || phase === "saving") return;
    const chatId = chat.id;
    void updateChat(chatId, (current) => ({ ...current, draft }), false);
    const pending = draftTimers.current.get(chatId);
    if (pending !== undefined) window.clearTimeout(pending);
    draftTimers.current.set(chatId, window.setTimeout(() => flushDraft(chatId), 350));
  };
  const create = () => {
    flushDraft(active);
    followReply.current = true;
    const next = emptyChat();
    threadsRef.current = [next, ...threadsRef.current];
    setThreads(threadsRef.current);
    setActive(next.id);
    queueSave(next);
    setView("chat");
    setDrawer(false);
  };
  const choose = (chatId: string) => {
    flushDraft(active);
    followReply.current = true;
    setActive(chatId);
    setView("chat");
    setDrawer(false);
  };
  const remove = async (chatId: string) => {
    if (!confirm(t("Delete this conversation and its saved attachments?")))
      return;
    flushDraft(chatId);
    await writes.current[chatId]?.catch(() => {});
    try {
      await storage.removeConversation(chatId);
      const next = threadsRef.current.filter((c) => c.id !== chatId);
      threadsRef.current = next;
      setThreads(next);
      if (active === chatId) setActive(next[0]?.id || "");
    } catch (e) {
      report(e);
    }
  };
  const rename = (c: Conversation) => {
    const title = prompt(t("Conversation name"), c.title)?.trim();
    if (title)
      updateChat(c.id, (x) => ({ ...x, title, updatedAt: Date.now() }));
  };
  const resetProviderForm = () => {
    setKeyInput("");
    setPassword("");
    setSaveKey(false);
    setShowKey(false);
  };
  const setProvider = (provider: ProviderId) => {
    resetProviderForm();
    saveSettings({ ...settings, provider });
  };
  const updateConfig = (patch: Partial<typeof config>) =>
    saveSettings({
      ...settings,
      providers: {
        ...settings.providers,
        [config.id]: { ...config, ...patch },
      },
    });
  const selectModel = (provider: ProviderId, option: ModelOption) => {
    if (provider !== settings.provider) resetProviderForm();
    saveSettings({
      ...settings,
      provider,
      providers: {
        ...settings.providers,
        [provider]: configureModel(settings.providers[provider], option),
      },
    });
  };
  const loadCatalog = async (provider: ProviderId, keyOverride?: string) => {
    const target = settings.providers[provider];
    const options = await listModelOptions(target, keyOverride || secrets[provider] || "");
    setCatalogs((current) => ({ ...current, [provider]: { endpoint: target.endpoint, options } }));
    return options;
  };
  const setReasoning = (enabled: boolean) => updateConfig({
    reasoningSupported: true,
    requestThoughts: enabled,
  });
  const processFiles = async (selected: File[]) => {
    if (!selected.length || !chat || controller.current || attachmentJob.current) return;
    const chatId = chat.id;
    attachmentJob.current = true;
    setProcessingFiles(true);
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
      attachmentJob.current = false;
      setProcessingFiles(false);
    }
  };
  const beginReply = (draft: Conversation | null) => {
    const abort = new AbortController();
    controller.current = abort;
    submittedDraft.current = draft;
    setPhase("saving");
    return abort;
  };
  const finishReply = (abort: AbortController) => {
    if (controller.current !== abort) return;
    controller.current = null;
    submittedDraft.current = null;
    setPhase("idle");
  };
  const stopReply = () => {
    const abort = controller.current;
    if (phase !== "streaming" || !abort || abort.signal.aborted) return;
    setPhase("stopping");
    abort.abort();
  };
  const runReply = async (
    chatId: string,
    history: Message[],
    reply: Message,
    abort: AbortController,
  ) => {
    if (controller.current !== abort) return;
    submittedDraft.current = null;
    setPhase("streaming");
    setNotice("");
    let content = "";
    let reasoning = "";
    const pricing = !history.some((message) => hasImage(message.attachments))
      ? selectedModel?.pricing
      : undefined;
    const tracker = createResponseTracker(
      reply.telemetry ?? responseIdentity(config),
      pricing,
    );
    let lastCheckpoint = performance.now();
    const publish = (status: NonNullable<Message["status"]>, persist: boolean) => {
      if (controller.current !== abort) return;
      const telemetry = tracker.snapshot();
      void updateChat(
        chatId,
        (c) => ({
          ...c,
          ...(status === "complete" ? { updatedAt: Date.now() } : {}),
          messages: c.messages.map((m) =>
            m.id === reply.id
              ? { ...m, content, reasoning, status, telemetry }
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
    const updateDelta = (kind: "content" | "reasoning", text: string) => {
      if (controller.current !== abort || abort.signal.aborted) return;
      if (kind === "content") {
        tracker.visible(text);
        content += text;
      } else reasoning += text;
      publishStream();
    };
    const timer = window.setInterval(() => {
      if (!abort.signal.aborted) publish("streaming", false);
    }, 500);
    try {
      await streamChat(
        config,
        secrets[config.id] || "",
        history,
        abort.signal,
        (text) => updateDelta("content", text),
        (text) => updateDelta("reasoning", text),
        (sample, receivedAt) => {
          if (
            controller.current === abort &&
            !abort.signal.aborted &&
            tracker.receive(sample, receivedAt)
          ) {
            publishStream();
          }
        },
      );
      publish(abort.signal.aborted ? "interrupted" : "complete", true);
    } catch (e) {
      if (controller.current !== abort) return;
      const stopped = abort.signal.aborted;
      publish(stopped ? "interrupted" : "error", true);
      if (!stopped) setNotice(errorText(e));
    } finally {
      window.clearInterval(timer);
      finishReply(abort);
    }
  };
  const send = async () => {
    if (controller.current || attachmentJob.current) return;
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
    const reply: Message = {
      id: id(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "streaming",
      telemetry: responseIdentity(config),
    };
    const history = [...chat.messages, user];
    const chatId = chat.id;
    const nextTitle =
      chat.title === "New chat"
        ? chat.draft.trim().slice(0, 60) || files[0]?.name || "New chat"
        : chat.title;
    const abort = beginReply(chat);
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
    await runReply(chatId, history, reply, abort);
  };
  const retry = async () => {
    if (!chat || controller.current || attachmentJob.current) return;
    if (replyBlocked) {
      setNotice(replyBlocked);
      return;
    }
    if (!isConfigured) {
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
    const reply: Message = {
      id: id(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "streaming",
      telemetry: responseIdentity(config),
    };
    const abort = beginReply(null);
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
    await runReply(chat.id, chat.messages, reply, abort);
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
        const saved = await saveSettings({
          ...settings,
          vaults: { ...settings.vaults, [config.id]: cipher },
        });
        if (!saved) {
          setSettings(settings);
          return;
        }
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
    const vaults = { ...settings.vaults };
    delete vaults[config.id];
    const saved = await saveSettings({ ...settings, vaults });
    if (!saved) {
      setSettings(settings);
      return;
    }
    setSecrets((previous) => ({ ...previous, [config.id]: undefined }));
    setKeyInput("");
    setPassword("");
    setNotice("Saved key removed and session locked.");
  };
  const refreshUsage = () => {
    if (!navigator.storage?.estimate) return;
    navigator.storage
      .estimate()
      .then((x) =>
        setUsage(
          x.usage != null
            ? `${formatSize(x.usage)} used${x.quota ? ` of approximately ${formatSize(x.quota)}` : ""}`
            : "Unavailable",
        ),
      )
      .catch(() => setUsage("Unavailable"));
  };
  useEffect(() => {
    if (view === "data") refreshUsage();
  }, [view]);
  const exportData = () => {
    const { vaults: _vaults, ...safeSettings } = settings;
    void _vaults;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            conversations: threadsRef.current,
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
      setImportData(value.conversations);
      const raw = value as { settings?: Partial<AppSettings> };
      setImportSettings(raw.settings);
    } catch (e) {
      setNotice(errorText(e));
    }
    if (importInput.current) importInput.current.value = "";
  };
  const finishImport = async (overwrite: boolean) => {
    if (!importData) return;
    let imported = 0;
    try {
      const existing = new Set(threadsRef.current.map((c) => c.id));
      for (const c of importData) {
        if (existing.has(c.id) && !overwrite) continue;
        const clean = {
          ...c,
          messages: c.messages.map((m) =>
            m.status === "streaming"
              ? { ...m, status: "interrupted" as const }
              : m,
          ),
        };
        flushDraft(c.id);
        await writes.current[c.id]?.catch(() => {});
        await storage.saveConversation(clean);
        threadsRef.current = [
          clean,
          ...threadsRef.current.filter((x) => x.id !== clean.id),
        ];
        existing.add(c.id);
        imported++;
      }
      setThreads([...threadsRef.current]);
      if (!active && threadsRef.current.length)
        setActive(threadsRef.current[0].id);
      if (
        importSettings &&
        confirm(
          t(
            "Import appearance and provider settings? Saved keys will remain on this device.",
          ),
        )
      ) {
        const merged = mergeSettings({
          ...settings,
          ...importSettings,
          vaults: settings.vaults,
        });
        saveSettings(merged);
      }
      setNotice(`Imported ${imported} conversations.`);
      setImportData(null);
    } catch (e) {
      setThreads([...threadsRef.current]);
      report(e);
    }
  };
  const clearData = async () => {
    if (
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
      threadsRef.current = [];
      setThreads([]);
      setActive("");
      setSettings(defaultSettings);
      setSecrets({});
      setNotice("Local data cleared.");
    } catch (e) {
      report(e);
    }
  };
  const filtered = threads
    .filter((c) =>
      `${c.title} ${c.messages.map((m) => m.content).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!ready) return <div className="loading">{t("Loading Luma Chat…")}</div>;
  const preferences: PreferenceProps = {
    locale,
    theme: settings.theme,
    language: settings.language,
    onTheme: (theme) => saveSettings({ ...settings, theme }),
    onLanguage: (language) => saveSettings({ ...settings, language }),
  };
  return (
    <div className="app">
      <Sidebar
        locale={locale}
        open={drawer}
        collapsed={desktop && settings.sidebarCollapsed}
        hiddenFromInput={desktop ? settings.sidebarCollapsed : !drawer}
        active={active}
        chatView={view === "chat"}
        query={query}
        chats={filtered}
        onQuery={setQuery}
        onClose={() => setDrawer(false)}
        onCreate={create}
        onChoose={choose}
        onRename={rename}
        onNavigate={(next) => {
          setView(next);
          setDrawer(false);
        }}
      />
      {drawer && (
        <button
          className="scrim"
          aria-label={t("Close menu")}
          onClick={() => setDrawer(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon desktop-toggle"
            aria-label={
              settings.sidebarCollapsed
                ? t("Expand sidebar")
                : t("Collapse sidebar")
            }
            aria-expanded={!settings.sidebarCollapsed}
            aria-controls="chat-sidebar"
            onClick={() =>
              saveSettings({
                ...settings,
                sidebarCollapsed: !settings.sidebarCollapsed,
              })
            }
          >
            <Menu size={22} />
          </button>
          <button
            className="icon mobile"
            aria-label={t("Open menu")}
            onClick={() => setDrawer(true)}
          >
            <Menu size={22} />
          </button>
          <strong>
            {view === "chat"
              ? !chat || chat.title === "New chat"
                ? t("New chat")
                : chat.title
              : view === "providers"
                ? t("AI providers")
                : view === "data"
                  ? t("Local data")
                  : t("Appearance")}
          </strong>
          <div className="top-actions">
            {view === "chat" && (
              <button
                className="model-pill"
                title={config.model || undefined}
                onClick={() => setView("providers")}
              >
                <Sparkles size={17} />
                <span>
                  {labels[config.id]} · {selectedModel ? compactModelName(selectedModel) : t("Choose a model")}
                </span>
                <ChevronDown size={16} />
              </button>
            )}
            {view === "chat" && (
              <span className="connection-state">
                {isConfigured ? t("Ready to send") : t("Setup needed")}
              </span>
            )}
            <span className="local-pill">
              <span className="dot" />
              {t(" Local storage")}
            </span>
            <TopbarPreferences {...preferences} />
            <button
              className="icon update-control"
              type="button"
              aria-label={updateLabel}
              title={updateLabel}
              aria-busy={checking}
              aria-disabled={checking}
              onClick={() => void check()}
            >
              <RefreshCw size={18} aria-hidden="true" />
              <span aria-hidden="true">v{version}</span>
            </button>
          </div>
          <Toast
            locale={locale}
            message={notice}
            onDismiss={() => setNotice("")}
          />
        </header>
        {view === "chat" && (
          <>
            <section
              className="conversation"
              aria-label={t("Conversation")}
              ref={conversation}
              onScroll={() => {
                const el = conversation.current;
                if (el)
                  followReply.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 120;
              }}
            >
              {!chat || chat.messages.length === 0 ? (
                <div className="welcome">
                  <div className="welcome-icon">
                    <Sparkles size={28} />
                  </div>
                  <h1>{t("How can I help you today?")}</h1>
                  <p>
                    {t(
                      "Your conversations stay on this device. Choose a provider and model to get started.",
                    )}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setView("providers")}
                  >
                    {t("Configure a provider")}
                  </button>
                  {!chat && (
                    <button className="primary" onClick={create}>
                      {t("Start a new chat")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="messages">
                  {chat.messages.map((m) => (
                    <article className={`message ${m.role}`} key={m.id}>
                      <div className="avatar">
                        {m.role === "user" ? t("U") : <Sparkles size={19} />}
                      </div>
                      <div className="bubble">
                        <div className="message-meta">
                          <strong>
                            {m.role === "assistant" ? t("Luma Chat") : t("You")}
                          </strong>
                          <time>
                            {new Date(m.createdAt).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        {m.reasoning && (
                          <Reasoning
                            locale={locale}
                            text={m.reasoning}
                            streaming={m.status === "streaming"}
                          />
                        )}
                        <Markdown
                          text={
                            m.content ||
                            (m.status === "streaming" && !m.reasoning
                              ? "Thinking…"
                              : "")
                          }
                        />
                        {m.attachments?.map((a) => (
                          <div className="attachment-label" key={a.id}>
                            <Paperclip size={14} />
                            {a.name} · {formatSize(a.size)}
                          </div>
                        ))}
                        {m.status === "interrupted" && (
                          <div className="status-label">
                            {t("Stopped or interrupted")}
                          </div>
                        )}
                        {m.status === "error" && (
                          <div className="status-label">
                            {t("Response failed")}
                          </div>
                        )}
                        {(m.status === "error" || m.status === "interrupted") &&
                          m.id ===
                            chat.messages[chat.messages.length - 1]?.id && (
                            <button
                              className="secondary retry"
                              disabled={working}
                              onClick={() => void retry()}
                            >
                              {t("Retry")}
                            </button>
                          )}
                        {m.content && (
                          <button
                            className="copy"
                            onClick={() =>
                              navigator.clipboard
                                ?.writeText(m.content)
                                .then(() => setNotice("Copied."))
                                .catch(() => setNotice("Copy unavailable."))
                            }
                          >
                            <Copy size={14} />
                            {t(" Copy")}
                          </button>
                        )}
                        {m.role === "assistant" && (
                          <ResponseInspector message={m} locale={locale} />
                        )}
                      </div>
                    </article>
                  ))}
                  <div ref={bottom} />
                </div>
              )}
            </section>
            <Composer
              locale={locale}
              enabled={Boolean(chat)}
              enterSends={desktopInput}
              draft={displayedDraft?.draft || ""}
              files={displayedDraft?.draftAttachments || []}
              processingFiles={processingFiles}
              phase={phase}
              blockedReason={chat ? composerBlocked : undefined}
              modelControl={
                <>
                  <ModelSelector
                    locale={locale}
                    autoFocusSearch={desktopInput}
                    provider={config.id}
                    selected={selectedModel}
                    groups={modelGroups}
                    onLoad={loadCatalog}
                    onSelect={selectModel}
                    onSettings={() => setView("providers")}
                  />
                  {reasoningAvailable && (
                    <button
                      className="icon composer-reasoning"
                      type="button"
                      title={reasoningLabel}
                      aria-label={reasoningLabel}
                      aria-pressed={config.requestThoughts === true}
                      onClick={() => setReasoning(!config.requestThoughts)}
                    >
                      <Brain size={18} aria-hidden="true" />
                      <span>{t("Reasoning")}</span>
                    </button>
                  )}
                </>
              }
              onDraft={editDraft}
              onFiles={processFiles}
              onRemove={(fileId) => chat && updateChat(chat.id, (c) => ({
                ...c,
                draftAttachments: c.draftAttachments?.filter((file) => file.id !== fileId),
              }))}
              onSend={() => void send()}
              onStop={stopReply}
            />
          </>
        )}
        {view === "providers" && (
          <section className="page">
            <button className="back" onClick={() => setView("chat")}>
              <ArrowLeft size={16} />
              {t(" Back to chat")}
            </button>
            <h1>{t("AI providers")}</h1>
            <p className="subtitle">
              {t(
                "Connect your own model. Requests go directly from this browser to the selected provider.",
              )}
            </p>
            <div className="provider-tabs">
              {providers.map((p) => (
                <button
                  key={p}
                  className={`tab ${settings.provider === p ? "active" : ""}`}
                  onClick={() => setProvider(p)}
                >
                  {labels[p]}
                </button>
              ))}
            </div>
            <div className="card">
              <div className="card-heading">
                <div className="provider-icon">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2>{labels[config.id]}</h2>
                  <p>
                    {config.id === "lmstudio"
                      ? t("Connect to a local or trusted network server.")
                      : config.id === "openrouter"
                        ? t(
                            "Use an OpenRouter key to access its model catalog.",
                          )
                        : t("Use your own API key and choose a model.")}
                  </p>
                </div>
              </div>
              {config.id === "lmstudio" && (
                <>
                  <label className="field">
                    {t("Server base URL")}
                    <input
                      value={config.endpoint}
                      onChange={(e) =>
                        updateConfig({ endpoint: e.target.value, vision: false })
                      }
                      placeholder="http://localhost:1234/v1"
                    />
                  </label>
                  <p className="hint">
                    {t(
                      "Enable CORS in LM Studio. On a phone, use the computer’s network address; localhost refers to the phone. Browser local-network permission, HTTPS restrictions and firewall settings can affect access. Enable authentication when exposing the server.",
                    )}
                  </p>
                </>
              )}
              <label className="field">
                {t("Model ID")}
                <input
                  list="model-list"
                  value={config.model}
                  onChange={(e) => {
                    const id = e.target.value;
                    selectModel(config.id, models.find((option) => option.id === id) || { id });
                  }}
                  placeholder={t("Enter a model ID or test connection")}
                />
              </label>
              <datalist id="model-list">
                {models.map(({ id }) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.vision}
                  onChange={(e) => updateConfig({ vision: e.target.checked })}
                />{" "}
                {t("This model supports image input")}
              </label>
              <p className="hint">
                {t(
                  "Enable only when your selected model supports images. Plain text attachments are sent as text.",
                )}
              </p>
              {canRequestReasoning(config.id) && (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={config.requestThoughts === true}
                      disabled={!config.model.trim()}
                      onChange={(e) => setReasoning(e.target.checked)}
                    />{" "}
                    {reasoningLabel}
                  </label>
                  <p className="hint">
                    {config.id === "gemini"
                      ? t(
                          "Enable for models that support thought summaries. Some requests or models return no summary.",
                        )
                      : t(
                          "Enable for supported models. Reasoning may affect cost, and some models do not expose it.",
                        )}
                  </p>
                </>
              )}
              <div className="divider" />
              <h3>
                {config.id === "lmstudio"
                  ? t("API token (optional)")
                  : t("API key")}
              </h3>
              <p className="hint">
                {t(
                  "Keys are accessible to this app while unlocked. Encrypted storage does not protect against malicious scripts or a compromised device. Your provider receives your messages.",
                )}
              </p>
              <label className="field">
                {config.id === "lmstudio" ? t("Token") : t("Key")}
                <div className="password-row">
                  <input
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={t("Enter key for this session")}
                  />
                  <button
                    className="secondary"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? t("Hide") : t("Show")}
                  </button>
                </div>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={saveKey}
                  onChange={(e) => setSaveKey(e.target.checked)}
                />{" "}
                {t("Save encrypted on this device")}
              </label>
              {(saveKey || settings.vaults[config.id]) && (
                <label className="field">
                  {t("Unlock password")}
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("Enter your password")}
                  />
                </label>
              )}
              <p className="hint">
                {t(
                  "If you forget the password, the saved key cannot be recovered. Session keys are cleared on reload.",
                )}
              </p>
              <div className="button-row">
                <button className="primary" onClick={() => void storeKey()}>
                  {t("Use key")}
                </button>
                {settings.vaults[config.id] && (
                  <>
                    <button className="secondary" onClick={() => void unlock()}>
                      {t("Unlock saved key")}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void deleteKey()}
                    >
                      {t("Delete saved key")}
                    </button>
                  </>
                )}
                {secrets[config.id] && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setSecrets((prev) => ({
                        ...prev,
                        [config.id]: undefined,
                      }));
                      setNotice("Key locked for this session.");
                    }}
                  >
                    {t("Lock")}
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => void testConnection()}
                >
                  {t("Test connection")}
                </button>
              </div>
              <p className="hint">
                {secrets[config.id]
                  ? t("A key or token is available for this session.")
                  : settings.vaults[config.id]
                    ? t("A saved key is locked.")
                    : t("No key is saved.")}{" "}
                {t(
                  "Testing requests the model list and may use network resources. A model list does not confirm the key or chat access.",
                )}
              </p>
            </div>
            <div className="info">
              {t(
                "Cloud providers may reject direct browser requests. This app does not include a proxy or server-side key store.",
              )}
            </div>
          </section>
        )}
        {view === "data" && (
          <section className="page">
            <button className="back" onClick={() => setView("chat")}>
              <ArrowLeft size={16} />
              {t(" Back to chat")}
            </button>
            <h1>{t("Local data")}</h1>
            <p className="subtitle">
              {t("Manage your chats, attachments, and browser storage.")}
            </p>
            <div className="data-grid">
              <div className="card">
                <h2>{t("Local storage")}</h2>
                <p>{translateNotice(locale, usage)}</p>
                <div className="stat-row">
                  <div>
                    <strong>{threads.length}</strong>
                    <span>{t("Conversations")}</span>
                  </div>
                  <div>
                    <strong>
                      {threads.reduce(
                        (n, c) =>
                          n +
                          (c.draftAttachments?.length || 0) +
                          c.messages.reduce(
                            (s, m) => s + (m.attachments?.length || 0),
                            0,
                          ),
                        0,
                      )}
                    </strong>
                    <span>{t("Attachments")}</span>
                  </div>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    if (!navigator.storage?.persist) {
                      setNotice(
                        "Persistent storage is unavailable in this browser.",
                      );
                      return;
                    }
                    navigator.storage
                      .persist()
                      .then((ok) =>
                        setNotice(
                          ok
                            ? "Persistent storage granted."
                            : "Persistent storage was not granted; keep backups.",
                        ),
                      )
                      .catch(() =>
                        setNotice("Could not request persistent storage."),
                      );
                  }}
                >
                  {t("Request persistent storage")}
                </button>
              </div>
              <div className="card">
                <h2>{t("Backup")}</h2>
                <p>
                  {t(
                    "Export conversations, attachments, and settings. API keys are excluded.",
                  )}
                </p>
                <div className="button-row">
                  <button className="primary" onClick={exportData}>
                    <Download size={16} />
                    {t(" Export backup")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => importInput.current?.click()}
                    disabled={working}
                  >
                    <Upload size={16} />
                    {t(" Import backup")}
                  </button>
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    ref={importInput}
                    onChange={(e) => void importFile(e.target.files?.[0])}
                  />
                </div>
              </div>
            </div>
            <div className="info">
              {t(
                "Browser storage can be cleared or evicted. Keep a backup of conversations you need. Data does not automatically sync between devices.",
              )}
            </div>
            {importData && (
              <div className="card">
                <h2>{t("Import preview")}</h2>
                <p>
                  {importData.length}
                  {t(" conversations;")}{" "}
                  {
                    importData.filter((c) => threads.some((t) => t.id === c.id))
                      .length
                  }{" "}
                  {t("have an existing ID. Backups do not contain keys.")}
                </p>
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() => void finishImport(false)}
                  >
                    {t("Import and skip conflicts")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (
                        confirm(
                          t(
                            "Replace existing conversations with matching IDs?",
                          ),
                        )
                      )
                        void finishImport(true);
                    }}
                  >
                    {t("Replace conflicts")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setImportData(null)}
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            )}
            <div className="card">
              <div className="section-head">
                <h2>{t("Conversations")}</h2>
                <button
                  className="danger"
                  onClick={() => void clearData()}
                  disabled={working}
                >
                  <Trash2 size={16} />
                  {t(" Clear all local data")}
                </button>
              </div>
              {threads.length === 0 ? (
                <p className="muted">{t("No conversations yet.")}</p>
              ) : (
                <div className="data-list">
                  {threads.map((c) => (
                    <div className="data-item" key={c.id}>
                      <div>
                        <strong>{c.title}</strong>
                        <small>
                          {c.messages.length}
                          {t(" messages ·")}{" "}
                          {new Date(c.updatedAt).toLocaleDateString(locale)}
                        </small>
                      </div>
                      <button
                        className="icon"
                        aria-label={interpolate(
                          t("Delete {name}"),
                          c.title === "New chat" ? t("New chat") : c.title,
                        )}
                        disabled={working}
                        onClick={() => void remove(c.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
        {view === "appearance" && (
          <section className="page">
            <button className="back" onClick={() => setView("chat")}>
              <ArrowLeft size={16} />
              {t(" Back to chat")}
            </button>
            <h1>{t("Appearance")}</h1>
            <p className="subtitle">
              {t("Choose how Luma Chat looks on this device.")}
            </p>
            <div className="card">
              <PreferenceFields {...preferences} fieldClassName="field" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
export default App;
