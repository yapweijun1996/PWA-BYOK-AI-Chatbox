import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, MessageSquare, Search, X } from "lucide-react";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
import type { Conversation, WorkspaceProject } from "../types";
import { searchConversations } from "../workspace";

export type SearchMode = "active" | "archived";
type Props = {
  locale: Locale;
  initialMode: SearchMode;
  chats: Conversation[];
  projects: WorkspaceProject[];
  onClose: () => void;
  onChoose: (id: string) => void;
  onRestore: (id: string) => void;
};

export function WorkspaceSearch({
  locale,
  initialMode,
  chats,
  projects,
  onClose,
  onChoose,
  onRestore,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchConversations(chats, query, mode === "archived", projects),
    [chats, query, mode, projects],
  );
  const close = () => dialog.current?.close();
  const choose = (chatId: string) => {
    close();
    onChoose(chatId);
  };
  useLayoutEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    field.current?.focus();
  }, []);

  return (
    <dialog
      className="workspace-dialog workspace-search"
      aria-labelledby={titleId}
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (
          event.key === "Enter" &&
          event.target === field.current &&
          results[0]
        ) {
          event.preventDefault();
          choose(results[0].id);
          return;
        }
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        const rows = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            ".search-result-open",
          ),
        );
        const selected = rows.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (event.target !== field.current && selected < 0) return;
        if (!rows.length) return;
        event.preventDefault();
        if (event.key === "ArrowUp" && selected <= 0) field.current?.focus();
        else
          rows[
            Math.min(
              rows.length - 1,
              selected + (event.key === "ArrowDown" ? 1 : -1),
            )
          ].focus();
      }}
    >
      <div className="workspace-panel">
        <div className="workspace-dialog-heading">
          <h2 id={titleId}>{t("Search conversations")}</h2>
          <button
            className="icon"
            type="button"
            aria-label={t("Close")}
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <label className="workspace-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label={t("Search conversations")}
            placeholder={t("Search chats...")}
            ref={field}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className="workspace-filters"
          role="group"
          aria-label={t("Search scope")}
        >
          <button
            aria-pressed={mode === "active"}
            onClick={() => setMode("active")}
          >
            {t("Conversations")}
          </button>
          <button
            aria-pressed={mode === "archived"}
            onClick={() => setMode("archived")}
          >
            {t("Archived")}
          </button>
        </div>
        <ul className="workspace-results">
          {results.map((chat) => {
            const title =
              chat.title === "New chat" ? t("New chat") : chat.title;
            const project = projects.find(({ id }) => id === chat.projectId);
            return (
              <li className="search-result" key={chat.id}>
                <button
                  className="search-result-open"
                  onClick={() => choose(chat.id)}
                >
                  <MessageSquare size={16} aria-hidden="true" />
                  <span>
                    {title}
                    {project && <small>{project.name}</small>}
                  </span>
                </button>
                {mode === "archived" && (
                  <button
                    className="icon"
                    aria-label={interpolate(t("Restore {name}"), title)}
                    onClick={() => {
                      onRestore(chat.id);
                      field.current?.focus();
                    }}
                  >
                    <ArchiveRestore size={18} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!results.length && (
          <p className="muted workspace-empty">
            {t(
              mode === "archived" && !query.trim()
                ? "No archived conversations."
                : "No conversations found.",
            )}
          </p>
        )}
      </div>
    </dialog>
  );
}
