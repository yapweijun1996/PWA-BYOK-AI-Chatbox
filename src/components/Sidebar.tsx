import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  Folder,
  FolderPlus,
  LoaderCircle,
  MoreHorizontal,
  Search,
  Settings,
  SquarePen,
  X,
} from "lucide-react";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
import type { Conversation, WorkspaceProject } from "../types";
import {
  groupConversations,
  groupRecentByDate,
  normalizeSidebarWidth,
  sidebarWidth,
} from "../workspace";
import { WorkspaceActions } from "./WorkspaceActions";
import type { ChatOrganization, WorkspaceRequest } from "./WorkspaceActions";
import type { SearchMode } from "./WorkspaceSearch";
import {
  collapsedProjectsKey,
  sidebarPreferencesCleared,
} from "../sidebar-preferences";

type Props = {
  locale: Locale;
  open: boolean;
  desktop: boolean;
  collapsed: boolean;
  width: number;
  active: string;
  chatView: boolean;
  chats: Conversation[];
  projects: WorkspaceProject[];
  working: boolean;
  onClose: () => void;
  onCreate: () => void;
  onChoose: (id: string) => Promise<true | undefined>;
  onNotice: (text: string) => void;
  onSearch: (mode: SearchMode) => void;
  onSettings: () => void;
  onWidthChange: (width: number) => void;
  onChat: (id: string, patch: ChatOrganization) => Promise<boolean>;
  onDeleteChat: (id: string) => Promise<void>;
  onSaveProject: (name: string, id?: string, chatId?: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<boolean> | undefined;
};

function readCollapsedProjects(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(collapsedProjectsKey) || "[]",
    );
    return Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === "string")
          .slice(0, 5000)
      : [];
  } catch {
    return [];
  }
}

export function Sidebar({
  locale,
  open,
  desktop,
  collapsed,
  width,
  active,
  chatView,
  chats,
  projects,
  working,
  onClose,
  onCreate,
  onChoose,
  onNotice,
  onSearch,
  onSettings,
  onWidthChange,
  onChat,
  onDeleteChat,
  onSaveProject,
  onDeleteProject,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const { pinned, recent, folders, counts } = useMemo(
    () => groupConversations(chats, projects),
    [chats, projects],
  );
  const [request, setRequest] = useState<WorkspaceRequest | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number>();
  const [collapsedProjects, setCollapsedProjects] = useState(
    readCollapsedProjects,
  );
  const [clock, setClock] = useState(() => Date.now());
  const [pendingChat, setPendingChat] = useState<string>();
  const [showPending, setShowPending] = useState(false);
  const [actionBusy, setActionBusy] = useState<string>();
  const [showActionBusy, setShowActionBusy] = useState(false);
  const actionLock = useRef(false);
  const pending = useRef(false);
  const recentGroups = useMemo(
    () => groupRecentByDate(recent, new Date(clock)),
    [recent, clock],
  );
  const activeCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const chat of chats)
      if (!chat.archived && chat.projectId)
        result.set(chat.projectId, (result.get(chat.projectId) || 0) + 1);
    return result;
  }, [chats]);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(
    null,
  );
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const showing = desktop ? !collapsed : open;
  const mobileOpen = !desktop && open;
  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    const interval = window.setInterval(updateClock, 60_000);
    window.addEventListener("focus", updateClock);
    const syncProjects = (event: StorageEvent) => {
      if (event.key === collapsedProjectsKey || event.key === null)
        setCollapsedProjects(readCollapsedProjects());
    };
    window.addEventListener("storage", syncProjects);
    const clearProjects = () => setCollapsedProjects([]);
    window.addEventListener(sidebarPreferencesCleared, clearProjects);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateClock);
      window.removeEventListener("storage", syncProjects);
      window.removeEventListener(sidebarPreferencesCleared, clearProjects);
    };
  }, []);
  const toggleProject = (id: string) => {
    setCollapsedProjects((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      try {
        localStorage.setItem(collapsedProjectsKey, JSON.stringify(next));
      } catch {
        /* Keep this tab usable if storage is unavailable. */
      }
      return next;
    });
  };
  const selectChat = async (id: string) => {
    if (pending.current) return;
    pending.current = true;
    setPendingChat(id);
    const timer = window.setTimeout(() => setShowPending(true), 180);
    try {
      await onChoose(id);
    } catch {
      onNotice("Could not open this conversation. Your work is unchanged.");
    } finally {
      window.clearTimeout(timer);
      pending.current = false;
      setPendingChat(undefined);
      setShowPending(false);
    }
  };
  const runAction = async (
    key: string,
    action: () => Promise<unknown> | undefined,
  ) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionBusy(key);
    const timer = window.setTimeout(() => setShowActionBusy(true), 180);
    try {
      await action();
    } catch {
      onNotice("Something went wrong.");
    } finally {
      window.clearTimeout(timer);
      actionLock.current = false;
      setActionBusy(undefined);
      setShowActionBusy(false);
    }
  };
  useLayoutEffect(() => {
    if (mobileOpen) closeButton.current?.focus();
  }, [mobileOpen]);
  useEffect(() => {
    if (showing) return;
    setRequest(null);
    drag.current = null;
    setPreviewWidth(undefined);
  }, [showing]);

  const dismissActions = () => {
    const key = request?.anchor.dataset.workspaceAnchor;
    setRequest(null);
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body || panel.current?.inert)
        return;
      const replacement =
        key &&
        Array.from(
          panel.current?.querySelectorAll<HTMLButtonElement>(
            "[data-workspace-anchor]",
          ) ?? [],
        ).find((button) => button.dataset.workspaceAnchor === key);
      (
        replacement ||
        panel.current?.querySelector<HTMLButtonElement>(
          ".workspace-search-trigger",
        )
      )?.focus();
    });
  };

  const row = (chat: Conversation) => {
    const title = chat.title === "New chat" ? t("New chat") : chat.title;
    const selected = chat.id === active && chatView;
    return (
      <li
        className={`history-item${selected ? " selected" : ""}`}
        key={chat.id}
      >
        <button
          className="history-name"
          aria-busy={
            pendingChat === chat.id ||
            actionBusy === `chat:${chat.id}` ||
            undefined
          }
          aria-current={selected ? "page" : undefined}
          title={title}
          onClick={() => void selectChat(chat.id)}
        >
          <span>{title}</span>
          {((pendingChat === chat.id && showPending) ||
            (actionBusy === `chat:${chat.id}` && showActionBusy)) && (
            <LoaderCircle
              className="sidebar-loader"
              size={18}
              aria-hidden="true"
            />
          )}
        </button>
        <button
          className="icon workspace-more"
          data-workspace-anchor={`chat:${chat.id}`}
          aria-label={interpolate(t("Actions for {name}"), title)}
          aria-haspopup="dialog"
          aria-disabled={Boolean(actionBusy) || undefined}
          aria-expanded={request?.kind === "chat" && request.id === chat.id}
          onClick={(event) => {
            if (actionLock.current) return;
            setRequest({
              kind: "chat",
              id: chat.id,
              anchor: event.currentTarget,
            });
          }}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </li>
    );
  };
  const selectedChat =
    request?.kind === "chat"
      ? chats.find(({ id }) => id === request.id)
      : undefined;
  const selectedProject =
    request?.kind === "project"
      ? projects.find(({ id }) => id === request.id)
      : undefined;
  const visibleWidth = previewWidth ?? width;

  return (
    <aside
      id="chat-sidebar"
      ref={panel}
      className={`sidebar${mobileOpen ? " open" : ""}${desktop && collapsed ? " collapsed" : ""}`}
      style={desktop ? { width: collapsed ? 0 : visibleWidth } : undefined}
      inert={!showing || undefined}
      aria-hidden={!showing || undefined}
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen || undefined}
      aria-label={t("Workspace")}
      onKeyDown={(event) => {
        if (
          !mobileOpen ||
          event.defaultPrevented ||
          panel.current?.querySelector("dialog[open]")
        )
          return;
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), summary",
          ),
        ).filter((item) => item.getClientRects().length);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="brand">
        <img
          className="brand-mark"
          src={`${import.meta.env.BASE_URL}icon.svg`}
          width={28}
          height={28}
          alt=""
        />
        <strong>Luma Chat</strong>
        <button
          className="icon mobile close"
          ref={closeButton}
          aria-label={t("Close menu")}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="workspace-start">
        <button className="workspace-action new-chat" onClick={onCreate}>
          <SquarePen size={18} aria-hidden="true" />
          {t("New chat")}
        </button>
        <button
          className="workspace-action workspace-search-trigger"
          aria-haspopup="dialog"
          onClick={() => onSearch("active")}
        >
          <Search size={18} aria-hidden="true" />
          {t("Search conversations")}
          <kbd aria-hidden="true">
            {navigator.platform.startsWith("Mac") ? "⌘ K" : "Ctrl K"}
          </kbd>
        </button>
      </div>
      <nav className="history" aria-label={t("Conversations")}>
        <span className="visually-hidden" role="status">
          {showPending
            ? t("Opening conversation…")
            : showActionBusy
              ? t("Saving changes…")
              : ""}
        </span>
        <section aria-label={t("Pinned")}>
          <h2 className="history-label">{t("Pinned")}</h2>
          {pinned.length ? (
            <ul>{pinned.map(row)}</ul>
          ) : (
            <p className="workspace-empty muted">
              {t("No pinned conversations.")}
            </p>
          )}
        </section>
        <section aria-label={t("Projects")}>
          <div className="workspace-section-heading">
            <h2 className="history-label">{t("Projects")}</h2>
            <button
              className="icon workspace-more"
              aria-label={t("New project")}
              aria-busy={actionBusy === "projects" || undefined}
              aria-disabled={Boolean(actionBusy) || undefined}
              aria-haspopup="dialog"
              onClick={(event) => {
                if (!actionLock.current)
                  setRequest({ kind: "create", anchor: event.currentTarget });
              }}
            >
              {actionBusy === "projects" && showActionBusy ? (
                <LoaderCircle
                  className="sidebar-loader"
                  size={18}
                  aria-hidden="true"
                />
              ) : (
                <FolderPlus size={18} aria-hidden="true" />
              )}
            </button>
          </div>
          {!projects.length && (
            <p className="workspace-empty muted">{t("No projects yet.")}</p>
          )}
          {projects.map((project) => (
            <div className="workspace-project" key={project.id}>
              <div className="workspace-project-header">
                <button
                  className="workspace-project-toggle"
                  type="button"
                  title={project.name}
                  aria-expanded={!collapsedProjects.includes(project.id)}
                  aria-controls={`project-${encodeURIComponent(project.id)}`}
                  onClick={() => toggleProject(project.id)}
                >
                  <ChevronRight
                    className="workspace-project-chevron"
                    size={18}
                    aria-hidden="true"
                  />
                  <Folder size={18} aria-hidden="true" />
                  <strong>{project.name}</strong>
                  <span className="workspace-project-count">
                    {activeCounts.get(project.id) || 0}
                  </span>
                </button>
                <button
                  className="icon workspace-more"
                  aria-label={interpolate(
                    t("Project actions for {name}"),
                    project.name,
                  )}
                  aria-haspopup="dialog"
                  data-workspace-anchor={`project:${project.id}`}
                  aria-expanded={
                    request?.kind === "project" && request.id === project.id
                  }
                  aria-busy={
                    actionBusy === `project:${project.id}` || undefined
                  }
                  aria-disabled={Boolean(actionBusy) || undefined}
                  onClick={(event) => {
                    if (actionLock.current) return;
                    setRequest({
                      kind: "project",
                      id: project.id,
                      anchor: event.currentTarget,
                    });
                  }}
                >
                  {actionBusy === `project:${project.id}` && showActionBusy ? (
                    <LoaderCircle
                      className="sidebar-loader"
                      size={18}
                      aria-hidden="true"
                    />
                  ) : (
                    <MoreHorizontal size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              <ul
                id={`project-${encodeURIComponent(project.id)}`}
                aria-label={project.name}
                hidden={collapsedProjects.includes(project.id)}
              >
                {folders.get(project.id)?.map(row)}
              </ul>
            </div>
          ))}
        </section>
        <section aria-label={t("Recent")}>
          <h2 className="history-label">{t("Recent")}</h2>
          {recent.length ? (
            <>
              {(["Future", "Today", "Previous 7 days", "Earlier"] as const).map(
                (label) =>
                  recentGroups[label].length > 0 && (
                    <div className="recent-group" key={label}>
                      <h3 className="recent-group-label">{t(label)}</h3>
                      <ul>{recentGroups[label].map(row)}</ul>
                    </div>
                  ),
              )}
            </>
          ) : (
            <p className="workspace-empty muted">
              {t("No recent conversations.")}
            </p>
          )}
        </section>
      </nav>
      <div className="sidebar-bottom">
        <button
          className="workspace-action"
          aria-haspopup="dialog"
          onClick={() => onSearch("archived")}
        >
          <Archive size={18} aria-hidden="true" />
          {t("Archived")}
        </button>
        <button className="workspace-action" onClick={onSettings}>
          <Settings size={18} aria-hidden="true" />
          {t("Settings")}
        </button>
      </div>
      {desktop && !collapsed && (
        <div
          className="sidebar-resize"
          role="separator"
          aria-label={t("Resize sidebar")}
          aria-orientation="vertical"
          aria-controls="chat-sidebar"
          aria-valuemin={sidebarWidth.min}
          aria-valuemax={sidebarWidth.max}
          aria-valuenow={visibleWidth}
          tabIndex={0}
          onKeyDown={(event) => {
            const delta =
              event.key === "ArrowLeft"
                ? -16
                : event.key === "ArrowRight"
                  ? 16
                  : 0;
            const next =
              event.key === "Home"
                ? sidebarWidth.min
                : event.key === "End"
                  ? sidebarWidth.max
                  : delta
                    ? normalizeSidebarWidth(width + delta)
                    : undefined;
            if (next === undefined) return;
            event.preventDefault();
            onWidthChange(next);
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              width,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start?.pointer === event.pointerId)
              setPreviewWidth(
                normalizeSidebarWidth(start.width + event.clientX - start.x),
              );
          }}
          onPointerUp={(event) => {
            const start = drag.current;
            if (start?.pointer !== event.pointerId) return;
            drag.current = null;
            setPreviewWidth(undefined);
            onWidthChange(
              normalizeSidebarWidth(start.width + event.clientX - start.x),
            );
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setPreviewWidth(undefined);
          }}
          onDoubleClick={() => onWidthChange(sidebarWidth.default)}
        />
      )}
      {showing &&
        request &&
        (request.kind === "create" || selectedChat || selectedProject) && (
          <WorkspaceActions
            request={request}
            locale={locale}
            chat={selectedChat}
            project={selectedProject}
            projects={projects}
            projectHasChats={Boolean(
              selectedProject && counts.get(selectedProject.id),
            )}
            working={working || Boolean(actionBusy)}
            onClose={dismissActions}
            onChat={(id, patch) =>
              void runAction(`chat:${id}`, () => onChat(id, patch))
            }
            onDeleteChat={(id) =>
              void runAction(`chat:${id}`, () => onDeleteChat(id))
            }
            onSaveProject={(name, id, chatId) =>
              void runAction(id ? `project:${id}` : "projects", () =>
                onSaveProject(name, id, chatId),
              )
            }
            onDeleteProject={(id) =>
              void runAction(`project:${id}`, () => onDeleteProject(id))
            }
          />
        )}
    </aside>
  );
}
