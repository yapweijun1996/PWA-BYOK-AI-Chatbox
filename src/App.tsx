import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  Menu,
  Plus,
  Search,
  Settings,
  Database,
  Send,
  Square,
  Paperclip,
  MessageCircle,
  Sparkles,
  Sun,
  ArrowLeft,
  Trash2,
  Download,
  Upload,
  Lock,
  Copy,
  X,
  ChevronDown,
} from "lucide-react";
import { storage } from "./storage";
import { decryptSecret, encryptSecret } from "./crypto";
import { listModels, streamChat } from "./providers";
import { defaultSettings, id, labels } from "./types";
import type {
  Attachment,
  Conversation,
  Message,
  ProviderId,
  Settings as AppSettings,
} from "./types";
import "./styles.css";

type View = "chat" | "providers" | "data" | "appearance";
type Secrets = Partial<Record<ProviderId, string>>;
const providers: ProviderId[] = ["gemini", "openai", "lmstudio"];
const emptyChat = (): Conversation => ({
  id: id(),
  title: "New chat",
  updatedAt: Date.now(),
  messages: [],
  draft: "",
});
const formatSize = (size: number) =>
  size >= 1048576
    ? `${(size / 1048576).toFixed(1)} MB`
    : `${(size / 1024).toFixed(1)} KB`;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
function mergeSettings(input: Partial<AppSettings> | undefined): AppSettings {
  const provider =
    input?.provider && providers.includes(input.provider)
      ? input.provider
      : defaultSettings.provider;
  const theme =
    input?.theme && ["light", "dark", "system"].includes(input.theme)
      ? input.theme
      : defaultSettings.theme;
  const configs = { ...defaultSettings.providers };
  for (const providerId of providers) {
    const saved = input?.providers?.[providerId];
    configs[providerId] = {
      ...defaultSettings.providers[providerId],
      model: typeof saved?.model === "string" ? saved.model : "",
      vision: saved?.vision === true,
      endpoint:
        providerId === "lmstudio" && typeof saved?.endpoint === "string"
          ? saved.endpoint
          : defaultSettings.providers[providerId].endpoint,
    };
  }
  return {
    provider,
    theme,
    providers: configs,
    vaults:
      input?.vaults && typeof input.vaults === "object" ? input.vaults : {},
  };
}
function validBackup(
  value: unknown,
): value is { version: number; conversations: Conversation[] } {
  if (!value || typeof value !== "object") return false;
  const data = value as { version?: unknown; conversations?: unknown };
  if (data.version !== 1 || !Array.isArray(data.conversations)) return false;
  return data.conversations.every(
    (c: Conversation) =>
      c &&
      typeof c.id === "string" &&
      typeof c.title === "string" &&
      typeof c.draft === "string" &&
      Number.isFinite(c.updatedAt) &&
      Array.isArray(c.messages) &&
      c.messages.every((m: Message) => {
        if (
          !m ||
          typeof m.id !== "string" ||
          !["user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" ||
          !Number.isFinite(m.createdAt)
        )
          return false;
        return (
          !m.attachments ||
          (Array.isArray(m.attachments) &&
            m.attachments.every(
              (a) =>
                a &&
                typeof a.id === "string" &&
                typeof a.name === "string" &&
                typeof a.mime === "string" &&
                typeof a.data === "string" &&
                Number.isFinite(a.size) &&
                (a.mime.startsWith("text/") ||
                  (a.mime.startsWith("image/") &&
                    /^data:image\/(png|jpeg|gif|webp);base64,/i.test(a.data))),
            ))
        );
      }),
  );
}
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
function App() {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const threadsRef = useRef<Conversation[]>([]);
  const [active, setActive] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [secrets, setSecrets] = useState<Secrets>({});
  const [view, setView] = useState<View>("chat");
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [models, setModels] = useState<string[]>([]);
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
  const writes = useRef<Record<string, Promise<void>>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLElement>(null);
  const followReply = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
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
      const previous = writes.current[chat.id] || Promise.resolve();
      writes.current[chat.id] = previous
        .catch(() => {})
        .then(() => storage.saveConversation(chat))
        .catch(report);
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
      if (changed && persist) queueSave(changed);
    },
    [queueSave],
  );
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
  const saveSettings = (next: AppSettings) => {
    setSettings(next);
    settingsWrite.current = settingsWrite.current
      .catch(() => {})
      .then(() => storage.saveSettings(next))
      .catch(report);
  };
  const config = settings.providers[settings.provider];
  const chat = threads.find((c) => c.id === active);
  useEffect(() => {
    if (view === "chat" && followReply.current) {
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [chat?.messages, active, view]);
  const isConfigured =
    !!config.model && (config.id === "lmstudio" || !!secrets[config.id]);
  const create = () => {
    followReply.current = true;
    const next = emptyChat();
    threadsRef.current = [next, ...threadsRef.current];
    setThreads(threadsRef.current);
    setActive(next.id);
    queueSave(next);
    setFiles([]);
    setView("chat");
    setDrawer(false);
  };
  const choose = (chatId: string) => {
    followReply.current = true;
    setActive(chatId);
    setFiles([]);
    setView("chat");
    setDrawer(false);
  };
  const remove = async (chatId: string) => {
    if (!confirm("Delete this conversation and its saved attachments?")) return;
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
    const title = prompt("Conversation name", c.title)?.trim();
    if (title)
      updateChat(c.id, (x) => ({ ...x, title, updatedAt: Date.now() }));
  };
  const setProvider = (provider: ProviderId) => {
    setKeyInput("");
    setPassword("");
    setModels([]);
    setSaveKey(false);
    saveSettings({ ...settings, provider });
  };
  const updateConfig = (patch: Partial<typeof config>) =>
    saveSettings({
      ...settings,
      providers: {
        ...settings.providers,
        [settings.provider]: { ...config, ...patch },
      },
    });
  const processFiles = async (selected: FileList | null) => {
    if (!selected) return;
    const result: Attachment[] = [];
    try {
      for (const file of Array.from(selected)) {
        const mime =
          file.type === "application/json" ||
          (!file.type && /\.(txt|md|csv|json)$/i.test(file.name))
            ? "text/plain"
            : file.type;
        if (
          !mime.startsWith("text/") &&
          !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime)
        )
          throw new Error(`${file.name}: use an image or plain text file.`);
        if (file.size > 5 * 1024 * 1024)
          throw new Error(`${file.name}: files must be 5 MB or smaller.`);
        const data = mime.startsWith("text/")
          ? await file.text()
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
        result.push({ id: id(), name: file.name, mime, size: file.size, data });
      }
      setFiles((previous) => [...previous, ...result]);
    } catch (e) {
      setNotice(errorText(e));
    }
    if (fileInput.current) fileInput.current.value = "";
  };
  const runReply = async (
    chatId: string,
    history: Message[],
    reply: Message,
  ) => {
    setWorking(true);
    setNotice("");
    const abort = new AbortController();
    controller.current = abort;
    let content = "";
    let lastCheckpoint = Date.now();
    try {
      await streamChat(
        config,
        secrets[config.id] || "",
        history,
        abort.signal,
        (text) => {
          content += text;
          const checkpoint = Date.now() - lastCheckpoint >= 500;
          if (checkpoint) lastCheckpoint = Date.now();
          updateChat(
            chatId,
            (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === reply.id ? { ...m, content } : m,
              ),
            }),
            checkpoint,
          );
        },
      );
      updateChat(chatId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) =>
          m.id === reply.id ? { ...m, content, status: "complete" } : m,
        ),
      }));
    } catch (e) {
      const stopped = abort.signal.aborted;
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === reply.id
            ? { ...m, content, status: stopped ? "interrupted" : "error" }
            : m,
        ),
      }));
      if (!stopped) setNotice(errorText(e));
    } finally {
      controller.current = null;
      setWorking(false);
    }
  };
  const send = async () => {
    if (working) return;
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
    if (!config.vision && files.some((f) => f.mime.startsWith("image/"))) {
      setNotice(
        "Enable image support for this model in Providers before sending images.",
      );
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
    };
    const history = [...chat.messages, user];
    const chatId = chat.id;
    const nextTitle =
      chat.title === "New chat"
        ? chat.draft.trim().slice(0, 60) || files[0]?.name || "New chat"
        : chat.title;
    updateChat(chatId, (c) => ({
      ...c,
      title: nextTitle,
      draft: "",
      updatedAt: Date.now(),
      messages: [...c.messages, user, reply],
    }));
    setFiles([]);
    await runReply(chatId, history, reply);
  };
  const retry = async () => {
    if (!chat || working) return;
    if (!isConfigured) {
      setNotice("Choose a model and unlock its key in Providers.");
      setView("providers");
      return;
    }
    if (
      !confirm(
        "Retry sends a new request to the selected provider and may incur charges. Continue?",
      )
    )
      return;
    const reply: Message = {
      id: id(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "streaming",
    };
    updateChat(chat.id, (c) => ({
      ...c,
      messages: [...c.messages, reply],
      updatedAt: Date.now(),
    }));
    await runReply(chat.id, chat.messages, reply);
  };
  const testConnection = async () => {
    try {
      setNotice("Connecting…");
      const result = await listModels(
        config,
        keyInput || secrets[config.id] || "",
      );
      setModels(result);
      setNotice(
        result.length
          ? `Connected. ${result.length} models found. Select one or enter its ID.`
          : "Connected, but no models were listed. Enter a model ID manually.",
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
        saveSettings({
          ...settings,
          vaults: { ...settings.vaults, [config.id]: cipher },
        });
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
  const deleteKey = () => {
    const vaults = { ...settings.vaults };
    delete vaults[config.id];
    saveSettings({ ...settings, vaults });
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
          "Import appearance and provider settings? Saved keys will remain on this device.",
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
        "Permanently delete all local chats, attachments, settings, and saved keys?",
      )
    )
      return;
    try {
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
      setFiles([]);
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
  if (!ready) return <div className="loading">Loading Luma Chat…</div>;
  return (
    <div className="app">
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={21} />
          </span>
          <strong>Luma Chat</strong>
          <button
            className="icon mobile close"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          >
            <X size={20} />
          </button>
        </div>
        <button className="primary new-chat" onClick={create}>
          <Plus size={19} /> New chat
        </button>
        <label className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search chats"
          />
        </label>
        <div className="history-label">Recent conversations</div>
        <div className="history">
          {filtered.length === 0 && (
            <p className="muted small">No conversations found.</p>
          )}
          {filtered.map((c) => (
            <div
              className={`history-item ${c.id === active && view === "chat" ? "selected" : ""}`}
              key={c.id}
            >
              <button className="history-name" onClick={() => choose(c.id)}>
                <MessageCircle size={16} />
                <span>{c.title}</span>
              </button>
              <button
                className="icon more"
                aria-label={`Rename ${c.title}`}
                onClick={() => rename(c)}
              >
                ⋯
              </button>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav"
            onClick={() => {
              setView("providers");
              setDrawer(false);
            }}
          >
            <Settings size={19} /> Settings
          </button>
          <button
            className="nav"
            onClick={() => {
              setView("data");
              setDrawer(false);
            }}
          >
            <Database size={19} /> Local data
          </button>
          <button
            className="nav"
            onClick={() => {
              setView("appearance");
              setDrawer(false);
            }}
          >
            <Sun size={19} /> Appearance
          </button>
        </div>
      </aside>
      {drawer && (
        <button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon mobile"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
          >
            <Menu size={22} />
          </button>
          <strong>
            {view === "chat"
              ? chat?.title || "New chat"
              : view === "providers"
                ? "AI providers"
                : view === "data"
                  ? "Local data"
                  : "Appearance"}
          </strong>
          <div className="top-actions">
            {view === "chat" && (
              <button
                className="model-pill"
                onClick={() => setView("providers")}
              >
                <Sparkles size={17} />
                <span>{config.model || "Choose a model"}</span>
                <ChevronDown size={16} />
              </button>
            )}
            <span className="local-pill">
              <span className="dot" /> Local storage
            </span>
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              className="icon"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {view === "chat" && (
          <>
            <section
              className="conversation"
              aria-label="Conversation"
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
                  <h1>How can I help you today?</h1>
                  <p>
                    Your conversations stay on this device. Choose a provider
                    and model to get started.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setView("providers")}
                  >
                    Configure a provider
                  </button>
                  {!chat && (
                    <button className="primary" onClick={create}>
                      Start a new chat
                    </button>
                  )}
                </div>
              ) : (
                <div className="messages">
                  {chat.messages.map((m) => (
                    <article className={`message ${m.role}`} key={m.id}>
                      <div className="avatar">
                        {m.role === "user" ? "U" : <Sparkles size={19} />}
                      </div>
                      <div className="bubble">
                        <div className="message-meta">
                          <strong>
                            {m.role === "assistant" ? "Luma Chat" : "You"}
                          </strong>
                          <time>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <Markdown
                          text={
                            m.content ||
                            (m.status === "streaming" ? "Thinking…" : "")
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
                            Stopped or interrupted
                          </div>
                        )}
                        {m.status === "error" && (
                          <div className="status-label">Response failed</div>
                        )}
                        {(m.status === "error" || m.status === "interrupted") &&
                          m.id ===
                            chat.messages[chat.messages.length - 1]?.id && (
                            <button
                              className="secondary retry"
                              disabled={working}
                              onClick={() => void retry()}
                            >
                              Retry
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
                            <Copy size={14} /> Copy
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  <div ref={bottom} />
                </div>
              )}
            </section>
            <div className="composer-wrap">
              {files.length > 0 && (
                <div className="file-list">
                  {files.map((f) => (
                    <span className="file-chip" key={f.id}>
                      {f.name}
                      <button
                        className="icon"
                        aria-label={`Remove ${f.name}`}
                        onClick={() =>
                          setFiles(files.filter((x) => x.id !== f.id))
                        }
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="composer">
                <textarea
                  rows={1}
                  placeholder="Ask anything..."
                  aria-label="Message"
                  value={chat?.draft || ""}
                  disabled={!chat}
                  onChange={(e) =>
                    chat &&
                    updateChat(chat.id, (c) => ({
                      ...c,
                      draft: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-actions">
                  <button
                    className="icon outlined"
                    aria-label="Attach image or text"
                    onClick={() => fileInput.current?.click()}
                    disabled={!chat || working}
                  >
                    <Paperclip size={20} />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,text/*,.md,.csv,.json"
                    multiple
                    hidden
                    onChange={(e) => void processFiles(e.target.files)}
                  />
                  <button
                    className="model-pill"
                    onClick={() => setView("providers")}
                  >
                    <Sparkles size={17} />
                    {config.model || "Choose model"}
                  </button>
                  <span className="spacer" />
                  {working ? (
                    <button
                      className="send"
                      aria-label="Stop generating"
                      onClick={() => controller.current?.abort()}
                    >
                      <Square size={18} />
                    </button>
                  ) : (
                    <button
                      className="send"
                      aria-label="Send message"
                      onClick={() => void send()}
                      disabled={!chat}
                    >
                      <Send size={20} />
                    </button>
                  )}
                </div>
              </div>
              <p className="privacy">
                <Lock size={13} /> Chats are stored on this device. Content is
                sent to your selected provider.
              </p>
            </div>
          </>
        )}
        {view === "providers" && (
          <section className="page">
            <button className="back" onClick={() => setView("chat")}>
              <ArrowLeft size={16} /> Back to chat
            </button>
            <h1>AI providers</h1>
            <p className="subtitle">
              Connect your own model. Requests go directly from this browser to
              the selected provider.
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
                      ? "Connect to a local or trusted network server."
                      : "Use your own API key and choose a model."}
                  </p>
                </div>
              </div>
              {config.id === "lmstudio" && (
                <>
                  <label className="field">
                    Server base URL
                    <input
                      value={config.endpoint}
                      onChange={(e) =>
                        updateConfig({ endpoint: e.target.value })
                      }
                      placeholder="http://localhost:1234/v1"
                    />
                  </label>
                  <p className="hint">
                    Enable CORS in LM Studio. On a phone, use the computer’s
                    network address; localhost refers to the phone. Browser
                    local-network permission, HTTPS restrictions and firewall
                    settings can affect access. Enable authentication when
                    exposing the server.
                  </p>
                </>
              )}
              <label className="field">
                Model ID
                <input
                  list="model-list"
                  value={config.model}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  placeholder="Enter a model ID or test connection"
                />
              </label>
              <datalist id="model-list">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.vision}
                  onChange={(e) => updateConfig({ vision: e.target.checked })}
                />{" "}
                This model supports image input
              </label>
              <p className="hint">
                Enable only when your selected model supports images. Plain text
                attachments are sent as text.
              </p>
              <div className="divider" />
              <h3>
                {config.id === "lmstudio" ? "API token (optional)" : "API key"}
              </h3>
              <p className="hint">
                Keys are accessible to this app while unlocked. Encrypted
                storage does not protect against malicious scripts or a
                compromised device. Your provider receives your messages.
              </p>
              <label className="field">
                {config.id === "lmstudio" ? "Token" : "Key"}
                <div className="password-row">
                  <input
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Enter key for this session"
                  />
                  <button
                    className="secondary"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={saveKey}
                  onChange={(e) => setSaveKey(e.target.checked)}
                />{" "}
                Save encrypted on this device
              </label>
              {(saveKey || settings.vaults[config.id]) && (
                <label className="field">
                  Unlock password
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </label>
              )}
              <p className="hint">
                If you forget the password, the saved key cannot be recovered.
                Session keys are cleared on reload.
              </p>
              <div className="button-row">
                <button className="primary" onClick={() => void storeKey()}>
                  Use key
                </button>
                {settings.vaults[config.id] && (
                  <>
                    <button className="secondary" onClick={() => void unlock()}>
                      Unlock saved key
                    </button>
                    <button className="secondary" onClick={deleteKey}>
                      Delete saved key
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
                    Lock
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => void testConnection()}
                >
                  Test connection
                </button>
              </div>
              <p className="hint">
                {secrets[config.id]
                  ? "A key or token is available for this session."
                  : settings.vaults[config.id]
                    ? "A saved key is locked."
                    : "No key is saved."}{" "}
                Testing requests the model list and may use network resources.
              </p>
            </div>
            <div className="info">
              Cloud providers may reject direct browser requests. This app does
              not include a proxy or server-side key store.
            </div>
          </section>
        )}
        {view === "data" && (
          <section className="page">
            <button className="back" onClick={() => setView("chat")}>
              <ArrowLeft size={16} /> Back to chat
            </button>
            <h1>Local data</h1>
            <p className="subtitle">
              Manage your chats, attachments, and browser storage.
            </p>
            <div className="data-grid">
              <div className="card">
                <h2>Local storage</h2>
                <p>{usage}</p>
                <div className="stat-row">
                  <div>
                    <strong>{threads.length}</strong>
                    <span>Conversations</span>
                  </div>
                  <div>
                    <strong>
                      {threads.reduce(
                        (n, c) =>
                          n +
                          c.messages.reduce(
                            (s, m) => s + (m.attachments?.length || 0),
                            0,
                          ),
                        0,
                      )}
                    </strong>
                    <span>Attachments</span>
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
                  Request persistent storage
                </button>
              </div>
              <div className="card">
                <h2>Backup</h2>
                <p>
                  Export conversations, attachments, and settings. API keys are
                  excluded.
                </p>
                <div className="button-row">
                  <button className="primary" onClick={exportData}>
                    <Download size={16} /> Export backup
                  </button>
                  <button
                    className="secondary"
                    onClick={() => importInput.current?.click()}
                    disabled={working}
                  >
                    <Upload size={16} /> Import backup
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
              Browser storage can be cleared or evicted. Keep a backup of
              conversations you need. Data does not automatically sync between
              devices.
            </div>
            {importData && (
              <div className="card">
                <h2>Import preview</h2>
                <p>
                  {importData.length} conversations;{" "}
                  {
                    importData.filter((c) => threads.some((t) => t.id === c.id))
                      .length
                  }{" "}
                  have an existing ID. Backups do not contain keys.
                </p>
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() => void finishImport(false)}
                  >
                    Import and skip conflicts
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (
                        confirm(
                          "Replace existing conversations with matching IDs?",
                        )
                      )
                        void finishImport(true);
                    }}
                  >
                    Replace conflicts
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setImportData(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="card">
              <div className="section-head">
                <h2>Conversations</h2>
                <button
                  className="danger"
                  onClick={() => void clearData()}
                  disabled={working}
                >
                  <Trash2 size={16} /> Clear all local data
                </button>
              </div>
              {threads.length === 0 ? (
                <p className="muted">No conversations yet.</p>
              ) : (
                <div className="data-list">
                  {threads.map((c) => (
                    <div className="data-item" key={c.id}>
                      <div>
                        <strong>{c.title}</strong>
                        <small>
                          {c.messages.length} messages ·{" "}
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </small>
                      </div>
                      <button
                        className="icon"
                        aria-label={`Delete ${c.title}`}
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
              <ArrowLeft size={16} /> Back to chat
            </button>
            <h1>Appearance</h1>
            <p className="subtitle">
              Choose how Luma Chat looks on this device.
            </p>
            <div className="card">
              <label className="field">
                Theme
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    saveSettings({
                      ...settings,
                      theme: e.target.value as AppSettings["theme"],
                    })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
export default App;
