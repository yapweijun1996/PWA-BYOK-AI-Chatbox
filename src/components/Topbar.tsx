import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  Download,
  Languages,
  Maximize,
  Menu,
  Minimize,
  MoreVertical,
  RefreshCw,
  ScanLine,
  Search,
  Settings as SettingsIcon,
  SquarePen,
  SunMoon,
} from "lucide-react";
import { version } from "../../package.json";
import { IconButton } from "./IconButton";
import { Toast } from "./Toast";
import { WorkspaceActions } from "./WorkspaceActions";
import type { WorkspaceRequest } from "./WorkspaceActions";
import { storage } from "../storage";
import type { useWorkspace } from "../use-workspace";

type Workspace = Pick<ReturnType<typeof useWorkspace>,
  "t" | "locale" | "settings" | "chat" | "view" | "check" | "checking" |
  "config" | "create" | "deleteProject" | "desktop" | "drawerToggle" |
  "mobileDrawer" | "navigating" | "notice" | "noticeRevision" | "online" |
  "openSettings" | "organizeChat" | "processingFiles" | "providerStatus" | "pwa" |
  "remove" | "saveProject" | "saveSettings" | "setDrawer" | "setInspecting" |
  "setNotice" | "setSearchMode" | "setView" | "toggleSidebar" | "updateLabel" | "working"
>;
const updateMessages = {
  idle: "Update check idle",
  checking: "Checking for updates…",
  current: "Luma Chat is up to date.",
  available: "An update is ready",
  failed: "Could not check for updates. Try again later.",
  offline: "You are offline. Reconnect to check for updates.",
  preparing: "The app is still preparing offline support. Try again shortly.",
  unavailable: "Update checks are unavailable in this build or browser.",
} as const;
const updateShortLabels = {
  idle: "",
  checking: "Checking",
  current: "Up to date",
  available: "Update available",
  failed: "Update failed",
  offline: "Offline",
  preparing: "Preparing",
  unavailable: "Unavailable",
} as const;

export function Topbar({ workspace }: { workspace: Workspace }) {
  const { t, locale, settings, chat, view } = workspace;
  const [actions, setActions] = useState<WorkspaceRequest | null>(null);
  const [readable, setReadable] = useState<"checking" | "ready" | "failed">(
    "checking",
  );
  const [fullscreen, setFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );
  const overflow = useRef<HTMLDetailsElement>(null);
  const languageMenu = useRef<HTMLDetailsElement>(null);
  const write = useSyncExternalStore(
    storage.subscribeWrites,
    storage.getWriteStatus,
  );

  useEffect(() => {
    let current = true;
    void storage.inspectRepository().then(
      () => {
        if (current) setReadable("ready");
      },
      () => {
        if (current) setReadable("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [write.revision]);
  useEffect(() => {
    const onFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    const onPointer = (event: PointerEvent) => {
      if (
        languageMenu.current?.open &&
        !languageMenu.current.contains(event.target as Node)
      )
        languageMenu.current.open = false;
      if (
        overflow.current?.open &&
        !overflow.current.contains(event.target as Node)
      )
        overflow.current.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && languageMenu.current?.open) {
        languageMenu.current.open = false;
        languageMenu.current.querySelector<HTMLElement>("summary")?.focus();
      }
      if (event.key === "Escape" && overflow.current?.open) {
        overflow.current.open = false;
        overflow.current.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const storageStatus = write.pending
    ? "Saving to IndexedDB"
    : write.lastOutcome === "failed"
      ? "Last local save failed"
      : readable === "ready"
        ? "IndexedDB available"
        : readable === "failed"
          ? "IndexedDB unavailable"
          : "Checking IndexedDB";
  const updateState =
    workspace.pwa.status === "waiting" ? "available" : workspace.pwa.checkState;
  const availableVersion =
    updateState === "available" ? workspace.pwa.availableVersion : undefined;
  const updateLabel =
    updateState === "available"
      ? `${t("Install update")}${availableVersion ? ` · v${availableVersion}` : ""}`
      : workspace.updateLabel;
  const updateText = availableVersion
    ? `${t(updateMessages[updateState])} · v${availableVersion}`
    : t(updateMessages[updateState]);
  const UpdateIcon =
    updateState === "current"
      ? CheckCircle2
      : updateState === "available"
        ? Download
        : updateState === "failed" ||
            updateState === "offline" ||
            updateState === "unavailable"
          ? CircleAlert
          : RefreshCw;
  const cycleTheme = () => {
    const options = ["system", "light", "dark"] as const;
    void workspace.saveSettings({
      theme: options[(options.indexOf(settings.theme) + 1) % options.length],
    });
  };
  const themeText = t(
    settings.theme === "system"
      ? "System"
      : settings.theme === "light"
        ? "Light"
        : "Dark",
  );
  const languageText = t(
    settings.language === "system"
      ? "System language"
      : settings.language === "en"
        ? "English"
        : settings.language === "ms"
          ? "Malay"
          : "Simplified Chinese",
  );
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      workspace.setNotice("Could not change fullscreen mode.");
    }
  };
  const closeMenu = (action: () => void) => {
    if (overflow.current) {
      overflow.current.open = false;
      overflow.current.querySelector<HTMLElement>("summary")?.focus();
    }
    action();
  };
  const openData = () => workspace.setView("data");
  const title =
    view === "chat"
      ? !chat || chat.title === "New chat"
        ? t("New chat")
        : chat.title
      : t("Settings");
  const providerStatus =
    !workspace.online && workspace.config.id !== "lmstudio"
      ? "Browser offline"
      : workspace.providerStatus;

  return (
    <header className="topbar">
      <IconButton
        className="desktop-toggle"
        label={t(
          settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
        )}
        aria-expanded={!settings.sidebarCollapsed}
        aria-controls="chat-sidebar"
        onClick={workspace.toggleSidebar}
      >
        <Menu size={18} aria-hidden="true" />
      </IconButton>
      <IconButton
        className="mobile"
        ref={workspace.drawerToggle}
        label={t("Open menu")}
        aria-expanded={workspace.mobileDrawer}
        aria-controls="chat-sidebar"
        onClick={() => workspace.setDrawer(true)}
      >
        <Menu size={18} aria-hidden="true" />
      </IconButton>
      <strong className="topbar-title">
        {view === "chat" && chat ? (
          <button
            className="topbar-title-button"
            type="button"
            title={title}
            aria-label={`${t("Conversation actions")} · ${title}`}
            aria-haspopup="dialog"
            aria-expanded={Boolean(
              actions?.kind === "chat" && actions.id === chat.id,
            )}
            onClick={(event) =>
              setActions({
                kind: "chat",
                id: chat.id,
                anchor: event.currentTarget,
              })
            }
          >
            <span>{title}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        ) : (
          <span>{title}</span>
        )}
      </strong>
      <div className="top-actions">
        <div className="update-group">
          <IconButton
            className="update-control"
            label={updateLabel}
            title={`${updateLabel} · ${updateText}`}
            aria-describedby="topbar-update-status"
            aria-busy={workspace.checking}
            aria-disabled={workspace.checking}
            data-update-state={updateState}
            onClick={() => void workspace.check()}
          >
            <span className="update-icon" aria-hidden="true">
              <UpdateIcon size={18} />
            </span>
            <span className="update-version" aria-hidden="true">
              v{version}
            </span>
            {updateState !== "idle" && (
              <span className="update-state-label" aria-hidden="true">
                {availableVersion && `v${availableVersion} · `}
                {t(updateShortLabels[updateState])}
              </span>
            )}
          </IconButton>
        </div>
        <span
          id="topbar-update-status"
          className="visually-hidden"
          role="status"
        >
          {updateText}
        </span>
        <details
          className="topbar-language"
          ref={languageMenu}
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary
            className="topbar-icon"
            aria-label={`${t("Change language")} · ${languageText}`}
            title={`${t("Language")} · ${languageText}`}
          >
            <Languages size={18} aria-hidden="true" />
          </summary>
          <div
            className="language-menu"
            role="group"
            aria-label={t("Language options")}
          >
            {(
              [
                ["system", "System language"],
                ["en", "English"],
                ["zh-CN", "Simplified Chinese"],
                ["ms", "Malay"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={settings.language === value}
                onClick={() => {
                  if (languageMenu.current) languageMenu.current.open = false;
                  void workspace.saveSettings({ language: value });
                  languageMenu.current
                    ?.querySelector<HTMLElement>("summary")
                    ?.focus();
                }}
              >
                <span>{t(label)}</span>
                {settings.language === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </details>
        <span className="topbar-desktop-actions">
          <IconButton
            label={t(storageStatus)}
            title={`IndexedDB · ${t(storageStatus)}`}
            onClick={openData}
            data-storage-state={storageStatus}
          >
            <Database size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`${t("Change theme")} · ${themeText}`}
            title={`${t("Theme")} · ${themeText}`}
            onClick={cycleTheme}
          >
            <SunMoon size={18} aria-hidden="true" />
          </IconButton>
          {document.fullscreenEnabled && (
            <IconButton
              label={t(fullscreen ? "Exit fullscreen" : "Enter fullscreen")}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? (
                <Minimize size={18} aria-hidden="true" />
              ) : (
                <Maximize size={18} aria-hidden="true" />
              )}
            </IconButton>
          )}
          {!settings.sidebarCollapsed && (
            <IconButton
              label={t("Open settings from topbar")}
              title={t("Settings")}
              onClick={workspace.openSettings}
            >
              <SettingsIcon size={18} aria-hidden="true" />
            </IconButton>
          )}
        </span>
        {workspace.desktop && settings.sidebarCollapsed && (
          <>
            <IconButton
              className="workspace-shortcut"
              label={t("Search conversations")}
              aria-haspopup="dialog"
              onClick={() => workspace.setSearchMode("active")}
            >
              <Search size={18} aria-hidden="true" />
            </IconButton>
            <IconButton
              className="workspace-shortcut"
              label={t("Settings")}
              onClick={workspace.openSettings}
            >
              <SettingsIcon size={18} aria-hidden="true" />
            </IconButton>
          </>
        )}
        <IconButton
          className="inspector-control"
          label={t("Workspace Inspector")}
          aria-haspopup="dialog"
          onClick={() => workspace.setInspecting(true)}
        >
          <ScanLine size={18} aria-hidden="true" />
        </IconButton>
        <IconButton
          className="topbar-new"
          label={t("New chat from topbar")}
          title={t("New chat")}
          onClick={workspace.create}
        >
          <SquarePen size={18} aria-hidden="true" />
        </IconButton>
        <details
          className="topbar-more"
          ref={overflow}
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary
            className="topbar-icon"
            aria-label={t("More actions")}
            title={t("More actions")}
          >
            <MoreVertical size={18} aria-hidden="true" />
          </summary>
          <div className="topbar-menu">
            <section className="topbar-menu-status" aria-label={t("Status")}>
              <h2>{t("Status")}</h2>
              <p>
                <span>{t("Provider")}</span> {t(providerStatus)}
              </p>
              <p>
                <span>IndexedDB</span> {t(storageStatus)}
              </p>
              <p>
                <span>{t("Update")}</span> <span>{updateText}</span>
              </p>
            </section>
            <section className="topbar-menu-actions" aria-label={t("Actions")}>
              <h2>{t("Actions")}</h2>
              <button
                className="topbar-menu-inspector"
                type="button"
                onClick={() =>
                  closeMenu(() => {
                    workspace.setInspecting(true);
                  })
                }
              >
                <ScanLine size={18} aria-hidden="true" />
                {t("Workspace Inspector")}
              </button>
              <button type="button" onClick={() => closeMenu(openData)}>
                <Database size={18} aria-hidden="true" />
                {t(storageStatus)}
              </button>
              <label className="topbar-menu-select">
                <Languages size={18} aria-hidden="true" />
                <span>{t("Language")}</span>
                <select
                  aria-label={t("Change language")}
                  value={settings.language}
                  onChange={(event) =>
                    void workspace.saveSettings({
                      language: event.target.value as typeof settings.language,
                    })
                  }
                >
                  <option value="system">{t("System language")}</option>
                  <option value="en">{t("English")}</option>
                  <option value="zh-CN">{t("Simplified Chinese")}</option>
                  <option value="ms">{t("Malay")}</option>
                </select>
              </label>
              <label className="topbar-menu-select">
                <SunMoon size={18} aria-hidden="true" />
                <span>{t("Theme")}</span>
                <select
                  aria-label={t("Change theme")}
                  value={settings.theme}
                  onChange={(event) =>
                    void workspace.saveSettings({
                      theme: event.target.value as typeof settings.theme,
                    })
                  }
                >
                  <option value="system">{t("System")}</option>
                  <option value="light">{t("Light")}</option>
                  <option value="dark">{t("Dark")}</option>
                </select>
              </label>
              {document.fullscreenEnabled && (
                <button
                  type="button"
                  onClick={() => closeMenu(() => void toggleFullscreen())}
                >
                  {fullscreen ? (
                    <Minimize size={18} aria-hidden="true" />
                  ) : (
                    <Maximize size={18} aria-hidden="true" />
                  )}
                  {t(fullscreen ? "Exit fullscreen" : "Enter fullscreen")}
                </button>
              )}
              <button
                type="button"
                onClick={() => closeMenu(workspace.openSettings)}
              >
                <SettingsIcon size={18} aria-hidden="true" />
                {t("Settings")}
              </button>
            </section>
          </div>
        </details>
      </div>
      <Toast
        locale={locale}
        message={workspace.notice}
        revision={workspace.noticeRevision}
        onDismiss={() => workspace.setNotice("")}
      />
      {actions && chat && (
        <WorkspaceActions
          request={actions}
          locale={locale}
          chat={chat}
          projects={settings.projects}
          projectHasChats={false}
          working={
            workspace.working ||
            workspace.processingFiles ||
            workspace.navigating
          }
          onClose={() => {
            const anchor = actions.anchor;
            setActions(null);
            requestAnimationFrame(() => anchor.isConnected && anchor.focus());
          }}
          onChat={workspace.organizeChat}
          onDeleteChat={workspace.remove}
          onSaveProject={workspace.saveProject}
          onDeleteProject={workspace.deleteProject}
        />
      )}
    </header>
  );
}
