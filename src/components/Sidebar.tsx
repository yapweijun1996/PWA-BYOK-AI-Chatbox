import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Folder,
  FolderPlus,
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
  normalizeSidebarWidth,
  sidebarWidth,
} from "../workspace";
import { WorkspaceActions } from "./WorkspaceActions";
import type { ChatOrganization, WorkspaceRequest } from "./WorkspaceActions";
import type { SearchMode } from "./WorkspaceSearch";

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
  onChoose: (id: string) => void;
  onSearch: (mode: SearchMode) => void;
  onSettings: () => void;
  onWidthChange: (width: number) => void;
  onChat: (id: string, patch: ChatOrganization) => void;
  onDeleteChat: (id: string) => void;
  onSaveProject: (name: string, id?: string, chatId?: string) => void;
  onDeleteProject: (id: string) => void;
};

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
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(
    null,
  );
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const showing = desktop ? !collapsed : open;
  const mobileOpen = !desktop && open;
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
          aria-current={selected ? "page" : undefined}
          title={title}
          onClick={() => onChoose(chat.id)}
        >
          <span>{title}</span>
        </button>
        <button
          className="icon workspace-more"
          data-workspace-anchor={`chat:${chat.id}`}
          aria-label={interpolate(t("Actions for {name}"), title)}
          aria-haspopup="dialog"
          aria-expanded={request?.kind === "chat" && request.id === chat.id}
          onClick={(event) =>
            setRequest({
              kind: "chat",
              id: chat.id,
              anchor: event.currentTarget,
            })
          }
        >
          <MoreHorizontal size={17} aria-hidden="true" />
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
          <SquarePen size={17} aria-hidden="true" />
          {t("New chat")}
        </button>
        <button
          className="workspace-action workspace-search-trigger"
          aria-haspopup="dialog"
          onClick={() => onSearch("active")}
        >
          <Search size={17} aria-hidden="true" />
          {t("Search conversations")}
          <kbd aria-hidden="true">
            {navigator.platform.startsWith("Mac") ? "⌘ K" : "Ctrl K"}
          </kbd>
        </button>
      </div>
      <nav className="history" aria-label={t("Conversations")}>
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
              aria-haspopup="dialog"
              onClick={(event) =>
                setRequest({ kind: "create", anchor: event.currentTarget })
              }
            >
              <FolderPlus size={17} aria-hidden="true" />
            </button>
          </div>
          {!projects.length && (
            <p className="workspace-empty muted">{t("No projects yet.")}</p>
          )}
          {projects.map((project) => (
            <div className="workspace-project" key={project.id}>
              <div className="workspace-project-header">
                <span title={project.name}>
                  <Folder size={16} aria-hidden="true" />
                  <strong>{project.name}</strong>
                </span>
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
                  onClick={(event) =>
                    setRequest({
                      kind: "project",
                      id: project.id,
                      anchor: event.currentTarget,
                    })
                  }
                >
                  <MoreHorizontal size={17} aria-hidden="true" />
                </button>
              </div>
              <ul aria-label={project.name}>
                {folders.get(project.id)?.map(row)}
              </ul>
            </div>
          ))}
        </section>
        <section aria-label={t("Recent")}>
          <h2 className="history-label">{t("Recent")}</h2>
          {recent.length ? (
            <ul>{recent.map(row)}</ul>
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
          <Archive size={17} aria-hidden="true" />
          {t("Archived")}
        </button>
        <button className="workspace-action" onClick={onSettings}>
          <Settings size={17} aria-hidden="true" />
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
            working={working}
            onClose={dismissActions}
            onChat={onChat}
            onDeleteChat={onDeleteChat}
            onSaveProject={onSaveProject}
            onDeleteProject={onDeleteProject}
          />
        )}
    </aside>
  );
}
