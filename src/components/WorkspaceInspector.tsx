import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Download, X } from "lucide-react";
import { version } from "../../package.json";
import { formatSize } from "../format-size";
import { translate } from "../i18n";
import type { Locale } from "../i18n";
import type { WorkerStatus } from "../pwa-update";
import type { ResolvedConfig } from "../request-config";
import { storage } from "../storage";
import { requestHistory } from "../providers";
import { activePath } from "../branches";
import type { Conversation, Settings } from "../types";
import type { ActiveReply } from "../workspace-state";
import {
  configurationRows,
  inspectionTabs,
  serializeInspection,
  telemetryRows,
} from "../workspace-inspection";
import type {
  InspectionRows,
  InspectionTab,
  OriginStorage,
} from "../workspace-inspection";
import "../workspace-inspector.css";

type Props = {
  locale: Locale;
  chat?: Conversation;
  effective: ResolvedConfig;
  reply: ActiveReply | null;
  preferences: Pick<Settings, "theme" | "language">;
  processingFiles: boolean;
  online: boolean;
  effectiveTheme: "light" | "dark";
  credentialState: "Available for session" | "Saved key unavailable" | "Not set";
  originStorage: OriginStorage;
  conversationCount: number;
  getBufferedDrafts: () => number;
  pwa: { status: WorkerStatus; controlled: boolean; checking: boolean };
  redact: (value?: string) => string | null;
  onClose: () => void;
};

export function WorkspaceInspector({
  locale,
  chat,
  effective,
  reply,
  preferences,
  processingFiles,
  online,
  effectiveTheme,
  credentialState,
  originStorage,
  conversationCount,
  getBufferedDrafts,
  pwa,
  redact,
  onClose,
}: Props) {
  const t = (label: string) => translate(locale, label);
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<InspectionTab>("Runtime");
  const [selection, setSelection] = useState("");
  const status = useSyncExternalStore(
    storage.subscribeWrites,
    storage.getWriteStatus,
  );
  const [repository, setRepository] =
    useState<Awaited<ReturnType<typeof storage.inspectRepository>>>();
  useEffect(() => {
    let current = true;
    void storage.inspectRepository().then(
      (value) => {
        if (current) setRepository(value);
      },
      () => {
        if (current) setRepository(undefined);
      },
    );
    return () => {
      current = false;
    };
  }, [status.revision]);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const responses =
    chat?.messages.filter((message) => message.role === "assistant") ?? [];
  const selected =
    responses.find((message) => message.id === selection) ?? responses.at(-1);
  const relevantHistory = chat ? requestHistory(activePath(chat)).length : 0;
  const mode =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
      ? "Standalone"
      : matchMedia("(display-mode: fullscreen)").matches
        ? "Fullscreen"
        : matchMedia("(display-mode: minimal-ui)").matches
          ? "Minimal UI"
          : "Browser";
  const rows: InspectionRows = {
    Runtime: [
      {
        key: "startup",
        label: "Startup",
        value:
          document.documentElement.dataset.startup === "ready" ? "Ready" : null,
        source: "Startup lifecycle",
      },
      {
        key: "online",
        label: "Browser online",
        value: online,
        source: "Browser",
      },
      {
        key: "replyPhase",
        label: "Reply phase",
        value: reply?.phase ?? "idle",
        source: "Reply runtime",
      },
      {
        key: "replyInCurrentChat",
        label: "Reply is in current chat",
        value: reply ? reply.conversationId === chat?.id : null,
        source: "Reply runtime",
      },
      {
        key: "processingFiles",
        label: "Processing attachments",
        value: processingFiles,
        source: "Composer",
      },
      {
        key: "theme",
        label: "Theme preference",
        value: preferences.theme,
        source: "Global settings",
      },
      {
        key: "resolvedTheme",
        label: "Effective theme",
        value: effectiveTheme,
        source: "Appearance",
      },
      {
        key: "language",
        label: "Language preference",
        value: preferences.language,
        source: "Global settings",
      },
      {
        key: "locale",
        label: "Effective language",
        value: locale,
        source: "Application",
      },
    ],
    Context: [
      {
        key: "conversationSelected",
        label: "Active conversation",
        value: Boolean(chat),
        source: "Workspace session",
      },
      {
        key: "messages",
        label: "Messages",
        value: chat ? chat.messages.length : null,
        source: "Workspace session",
      },
      {
        key: "eligibleHistoryMessages",
        label: "Messages eligible for request history",
        value: chat ? relevantHistory : null,
        source: "Provider adapter",
      },
      {
        key: "draftCharacters",
        label: "Draft length",
        value: chat?.draft.length ?? null,
        source: "Composer",
      },
      {
        key: "draftAttachments",
        label: "Draft attachments",
        value: chat ? (chat.draftAttachments?.length ?? 0) : null,
        source: "Composer",
      },
      {
        key: "conversationOverride",
        label: "Conversation model override",
        value: chat ? Boolean(chat.configOverride) : null,
        source: "Workspace session",
      },
    ],
    Configuration: [
      ...configurationRows("effective", effective, redact),
      {
        key: "credentials",
        label: "Credential state",
        value: credentialState,
        source: "Credential store",
      },
      ...(reply ? configurationRows("active", reply.request, redact) : []),
      ...(selected?.request
        ? configurationRows("historical", selected.request, redact)
        : []),
    ],
    Telemetry: telemetryRows(selected, redact),
    Storage: [
      {
        key: "repository",
        label: "Repository",
        value: repository ? "IndexedDB" : null,
        source: "Browser",
      },
      {
        key: "database",
        label: "Database",
        value: repository?.name ?? null,
        source: "IndexedDB",
      },
      {
        key: "databaseVersion",
        label: "Database version",
        value: repository?.version ?? null,
        source: "IndexedDB",
      },
      {
        key: "savedCount",
        label: "Persisted conversations",
        value: repository?.conversationCount ?? null,
        source: "IndexedDB",
      },
      {
        key: "sessionCount",
        label: "Conversations in memory",
        value: conversationCount,
        source: "Workspace session",
      },
      {
        key: "bufferedDrafts",
        label: "Buffered draft writes",
        value: getBufferedDrafts(),
        source: "Workspace session",
      },
      {
        key: "pending",
        label: "Pending repository writes",
        value: status.pending,
        source: "IndexedDB",
      },
      {
        key: "lastWrite",
        label: "Last write outcome",
        value: status.lastOutcome,
        source: "IndexedDB",
      },
      {
        key: "persistent",
        label: "Persistent storage",
        value: originStorage.persistent ?? null,
        source: "Browser",
      },
      {
        key: "usage",
        label: "Origin usage estimate",
        value: originStorage.usage ?? null,
        source: "Browser",
        unit: "bytes",
      },
      {
        key: "quota",
        label: "Origin quota estimate",
        value: originStorage.quota ?? null,
        source: "Browser",
        unit: "bytes",
      },
    ],
    PWA: [
      { key: "version", label: "App version", value: version, source: "Build" },
      {
        key: "displayMode",
        label: "Display mode",
        value: mode,
        source: "Browser",
      },
      {
        key: "worker",
        label: "Service worker",
        value: pwa.status,
        source: "Service Worker API",
      },
      {
        key: "controlled",
        label: "Page controlled by worker",
        value: pwa.controlled,
        source: "Service Worker API",
      },
      {
        key: "checking",
        label: "Checking for updates",
        value: pwa.checking,
        source: "Update lifecycle",
      },
    ],
  };
  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([serializeInspection(rows)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "luma-workspace-inspection.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const format = ({
    key,
    value,
    unit,
  }: InspectionRows[InspectionTab][number]) => {
    if (value === null) return t("N/A");
    if (typeof value === "boolean") return t(value ? "Yes" : "No");
    if (typeof value === "string")
      return key === "servedModel" ||
        key === "finishReason" ||
        key === "reasoningEffort" ||
        key.endsWith(".model")
        ? value === "Redacted"
          ? t(value)
          : value
        : t(value);
    if (unit === "bytes") return formatSize(value);
    if (unit === "timestamp") return new Date(value).toLocaleString(locale);
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: key === "apiCost" ? 8 : 2 }).format(value)}${unit === "ms" ? " ms" : ""}`;
  };
  const renderRows = (items: InspectionRows[InspectionTab]) => (
    <dl className="inspection-values">
      {items.map((row) => (
        <div key={row.key}>
          <dt>{t(row.label)}</dt>
          <dd>{format(row)}</dd>
          <dd className="inspection-source">
            {row.value === null ? "" : t(row.source)}
          </dd>
        </div>
      ))}
    </dl>
  );
  const responsePicker = responses.length > 0 && (
    <label className="field">
      {t("Inspect response")}
      <select
        value={
          selection && responses.some(({ id }) => id === selection)
            ? selection
            : ""
        }
        onChange={(event) => setSelection(event.target.value)}
      >
        <option value="">{t("Latest response")}</option>
        {responses.map((response, index) => (
          <option key={response.id} value={response.id}>
            #{index + 1} · {new Date(response.createdAt).toLocaleString(locale)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog workspace-inspector"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="workspace-panel">
        <div className="workspace-dialog-heading">
          <h2 id={`${id}-title`}>{t("Workspace Inspector")}</h2>
          <button
            className="icon"
            type="button"
            aria-label={t("Close")}
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div
          className="inspection-tabs"
          role="tablist"
          aria-label={t("Inspector sections")}
          onKeyDown={(event) => {
            const index = inspectionTabs.indexOf(tab);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % inspectionTabs.length
                : event.key === "ArrowLeft"
                  ? (index + inspectionTabs.length - 1) % inspectionTabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? inspectionTabs.length - 1
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            setTab(inspectionTabs[next]);
            event.currentTarget.querySelectorAll("button")[next]?.focus();
          }}
        >
          {inspectionTabs.map((name) => (
            <button
              key={name}
              type="button"
              id={`${id}-tab-${name}`}
              className="tab"
              role="tab"
              aria-selected={name === tab}
              tabIndex={name === tab ? 0 : -1}
              aria-controls={`${id}-panel-${name}`}
              onClick={() => setTab(name)}
            >
              {t(name)}
            </button>
          ))}
        </div>
        {inspectionTabs.map((name) => (
          <div
            className="inspection-body"
            key={name}
            id={`${id}-panel-${name}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${name}`}
            tabIndex={0}
            hidden={name !== tab}
          >
            {name === tab && (
              <>
                {(tab === "Configuration" || tab === "Telemetry") &&
                  responsePicker}
                {tab === "Configuration" ? (
                  <>
                    <h3>{t("Effective configuration")}</h3>
                    {renderRows(
                      rows.Configuration.filter(
                        (row) =>
                          row.key.startsWith("effective.") ||
                          row.key === "credentials",
                      ),
                    )}
                    {reply && (
                      <>
                        <h3>{t("Active request snapshot")}</h3>
                        {renderRows(
                          rows.Configuration.filter((row) =>
                            row.key.startsWith("active."),
                          ),
                        )}
                      </>
                    )}
                    <h3>{t("Historical request snapshot")}</h3>
                    {selected?.request ? (
                      renderRows(
                        rows.Configuration.filter((row) =>
                          row.key.startsWith("historical."),
                        ),
                      )
                    ) : (
                      <p className="muted">
                        {t("No request snapshot recorded for this response.")}
                      </p>
                    )}
                  </>
                ) : rows[tab].length ? (
                  renderRows(rows[tab])
                ) : (
                  <p className="muted">
                    {t("No telemetry recorded for this response.")}
                  </p>
                )}
              </>
            )}
          </div>
        ))}
        <div className="inspection-footer">
          <small>
            {t(
              "Export excludes credentials, endpoint addresses, model identifiers, and conversation contents.",
            )}
          </small>
          <button className="secondary" type="button" onClick={exportJson}>
            <Download size={16} aria-hidden="true" />
            {t("Export snapshot")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
