import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Folder,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  X,
} from "lucide-react";
import { translate } from "../i18n";
import type { Locale } from "../i18n";
import type { Conversation, WorkspaceProject } from "../types";
import { chatTitleLimit, projectNameLimit } from "../workspace";

export type WorkspaceRequest =
  | { kind: "chat" | "project"; id: string; anchor: HTMLButtonElement }
  | { kind: "create"; anchor: HTMLButtonElement };
export type ChatOrganization = Partial<
  Pick<Conversation, "title" | "projectId" | "archived" | "pinned">
>;

type Props = {
  request: WorkspaceRequest;
  locale: Locale;
  chat?: Conversation;
  project?: WorkspaceProject;
  projects: WorkspaceProject[];
  projectHasChats: boolean;
  working: boolean;
  onClose: () => void;
  onChat: (id: string, patch: ChatOrganization) => void;
  onDeleteChat: (id: string) => void;
  onSaveProject: (name: string, id?: string, chatId?: string) => void;
  onDeleteProject: (id: string) => void;
};

export function WorkspaceActions({
  request,
  locale,
  chat,
  project,
  projects,
  projectHasChats,
  working,
  onClose,
  onChat,
  onDeleteChat,
  onSaveProject,
  onDeleteProject,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"actions" | "rename" | "move" | "create">(
    request.kind === "create" ? "create" : "actions",
  );
  const [name, setName] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const title =
    mode === "move"
      ? "Move to project"
      : mode === "create"
        ? "New project"
        : mode === "rename"
          ? chat
            ? "Rename conversation"
            : "Rename project"
          : chat
            ? "Conversation actions"
            : "Project actions";
  const close = () => {
    dialog.current?.close();
    // Reset the action form now; the browser queues the native close event.
    onClose();
  };
  const run = (action: () => void) => {
    close();
    action();
  };
  const rename = () => {
    setName(
      chat
        ? chat.title === "New chat"
          ? t("New chat")
          : chat.title
        : project?.name || "",
    );
    setMode("rename");
  };

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (!panel.open) panel.showModal();
    const anchor = request.anchor.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const inset = 12;
    const left = anchor.right - width;
    const top =
      anchor.bottom + height + inset <= innerHeight
        ? anchor.bottom + 4
        : anchor.top - height - 4;
    panel.style.left = `clamp(var(--dialog-left), ${left}px, calc(100vw - var(--dialog-right) - ${width}px))`;
    panel.style.top = `clamp(var(--dialog-top), ${top}px, calc(100dvh - var(--dialog-bottom) - ${height}px))`;
    const input = panel.querySelector<HTMLInputElement>("input");
    if (input) {
      input.focus();
      input.select();
    } else
      panel
        .querySelector<HTMLButtonElement>(
          ".workspace-options button:not(:disabled)",
        )
        ?.focus();
  }, [mode, request]);

  return (
    <dialog
      className="workspace-dialog workspace-actions"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (
          !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
          (mode !== "actions" && mode !== "move")
        )
          return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            ".workspace-options button:not(:disabled)",
          ),
        );
        if (!items.length) return;
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  items.length) %
                items.length;
        event.preventDefault();
        items[next].focus();
      }}
    >
      <div className="workspace-panel">
        <div className="workspace-dialog-heading">
          <h2 id={titleId}>{t(title)}</h2>
          <button
            className="icon"
            type="button"
            aria-label={t("Close")}
            onClick={close}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {mode === "actions" && (
          <div
            className="workspace-options"
            role="group"
            aria-labelledby={titleId}
          >
            {chat && (
              <>
                <button onClick={rename}>
                  <Pencil size={16} aria-hidden="true" />
                  {t("Rename conversation")}
                </button>
                <button
                  onClick={() =>
                    run(() => onChat(chat.id, { pinned: !chat.pinned }))
                  }
                >
                  {chat.pinned ? (
                    <PinOff size={16} aria-hidden="true" />
                  ) : (
                    <Pin size={16} aria-hidden="true" />
                  )}
                  {t(chat.pinned ? "Unpin" : "Pin")}
                </button>
                <button onClick={() => setMode("move")}>
                  <Folder size={16} aria-hidden="true" />
                  {t("Move to project")}
                </button>
                <button
                  onClick={() =>
                    run(() => onChat(chat.id, { archived: !chat.archived }))
                  }
                >
                  {chat.archived ? (
                    <ArchiveRestore size={16} aria-hidden="true" />
                  ) : (
                    <Archive size={16} aria-hidden="true" />
                  )}
                  {t(
                    chat.archived
                      ? "Restore from archive"
                      : "Archive conversation",
                  )}
                </button>
                <button
                  className="workspace-danger"
                  disabled={working}
                  onClick={() => run(() => onDeleteChat(chat.id))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {t("Delete conversation")}
                </button>
              </>
            )}
            {project && (
              <>
                <button onClick={rename}>
                  <Pencil size={16} aria-hidden="true" />
                  {t("Rename project")}
                </button>
                <button
                  className="workspace-danger"
                  disabled={projectHasChats}
                  onClick={() => run(() => onDeleteProject(project.id))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {t("Delete project")}
                </button>
                {projectHasChats && (
                  <p className="hint">
                    {t(
                      "Move all conversations out before deleting this project.",
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {mode === "move" && chat && (
          <div
            className="workspace-options"
            role="group"
            aria-labelledby={titleId}
          >
            <button
              disabled={!chat.projectId}
              onClick={() =>
                run(() => onChat(chat.id, { projectId: undefined }))
              }
            >
              {t("No project")}
            </button>
            {projects.map((item) => (
              <button
                key={item.id}
                disabled={item.id === chat.projectId}
                onClick={() =>
                  run(() => onChat(chat.id, { projectId: item.id }))
                }
              >
                <Folder size={16} aria-hidden="true" />
                {item.name}
              </button>
            ))}
            <button
              onClick={() => {
                setName("");
                setMode("create");
              }}
            >
              <FolderPlus size={16} aria-hidden="true" />
              {t("New project")}
            </button>
          </div>
        )}
        {(mode === "rename" || mode === "create") && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = name.trim();
              if (!value) return;
              if (mode === "rename" && chat) {
                run(() => onChat(chat.id, { title: value }));
                return;
              }
              if (
                projects.some(
                  (item) =>
                    item.id !== project?.id &&
                    item.name.toLowerCase() === value.toLowerCase(),
                )
              ) {
                setDuplicate(true);
                return;
              }
              run(() => onSaveProject(value, project?.id, chat?.id));
            }}
          >
            <label className="field">
              {t(
                mode === "rename" && chat
                  ? "Conversation name"
                  : "Project name",
              )}
              <input
                maxLength={
                  mode === "rename" && chat ? chatTitleLimit : projectNameLimit
                }
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setDuplicate(false);
                }}
                required
              />
            </label>
            {duplicate && (
              <p role="alert" className="workspace-danger">
                {t("A project with this name already exists.")}
              </p>
            )}
            <button className="primary" type="submit" disabled={!name.trim()}>
              {t(mode === "create" ? "Create project" : "Save changes")}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
