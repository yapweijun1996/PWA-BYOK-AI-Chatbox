import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArchiveRestore, MessageSquare, Search, X } from "lucide-react";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
import type { Conversation, WorkspaceProject } from "../types";
import { searchWorkspace, type WorkspaceSearchResult } from "../workspace";

const resultLimit = 100;
function highlighted(text: string, query: string) {
  const needle = query.trim();
  const folded = text.toLowerCase();
  const target = needle.toLowerCase();
  if (
    !target ||
    folded.length !== text.length ||
    target.length !== needle.length
  )
    return text;
  const parts: ReactNode[] = [];
  let start = 0;
  for (;;) {
    const index = folded.indexOf(target, start);
    if (index < 0) break;
    parts.push(
      text.slice(start, index),
      <mark key={index}>{text.slice(index, index + target.length)}</mark>,
    );
    start = index + target.length;
  }
  if (!parts.length) return text;
  parts.push(text.slice(start));
  return parts;
}

export type SearchMode = "active" | "archived";
type Props = {
  locale: Locale;
  initialMode: SearchMode;
  chats: Conversation[];
  projects: WorkspaceProject[];
  onClose: () => void;
  onChoose: (id: string, messageId?: string) => Promise<string | undefined>;
  restoreDisabled: boolean;
  onRestore: (id: string) => Promise<boolean>;
};

export function WorkspaceSearch({
  locale,
  initialMode,
  chats,
  projects,
  onClose,
  onChoose,
  restoreDisabled,
  onRestore,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [openError, setOpenError] = useState("");
  const [restoreState, setRestoreState] = useState<
    "idle" | "pending" | "failed"
  >("idle");
  const results = useMemo(
    () =>
      searchWorkspace(
        chats,
        query,
        mode === "archived",
        projects,
        resultLimit + 1,
      ),
    [chats, query, mode, projects],
  );
  const visibleResults = results.slice(0, resultLimit);
  const groups = useMemo(() => {
    const result = new Map<
      string,
      {
        chat: Conversation;
        conversation?: WorkspaceSearchResult;
        messages: WorkspaceSearchResult[];
      }
    >();
    for (const entry of results.slice(0, resultLimit)) {
      const group = result.get(entry.chat.id) ?? {
        chat: entry.chat,
        messages: [],
      };
      if (entry.message) group.messages.push(entry);
      else group.conversation = entry;
      result.set(entry.chat.id, group);
    }
    return [...result.values()];
  }, [results]);
  const close = () => {
    if (!openingRef.current) dialog.current?.close();
  };
  const choose = async (result: WorkspaceSearchResult) => {
    if (restoreState === "pending" || openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setOpenError("");
    try {
      const error = await onChoose(result.chat.id, result.message?.id);
      if (error) {
        setOpenError(error);
        requestAnimationFrame(() => field.current?.focus());
      } else dialog.current?.close();
    } catch {
      setOpenError("Could not open this message. Your work is unchanged.");
      requestAnimationFrame(() => field.current?.focus());
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
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
      aria-busy={opening || undefined}
      onClose={onClose}
      onCancel={(event) => {
        if (openingRef.current) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (
          event.key === "Enter" &&
          event.target === field.current &&
          visibleResults[0]
        ) {
          event.preventDefault();
          void choose(visibleResults[0]);
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
            disabled={opening}
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
            disabled={opening}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenError("");
            }}
          />
        </label>
        <div
          className="workspace-filters"
          role="group"
          aria-label={t("Search scope")}
        >
          <button
            aria-pressed={mode === "active"}
            disabled={opening}
            onClick={() => {
              setMode("active");
              setOpenError("");
            }}
          >
            {t("Conversations")}
          </button>
          <button
            aria-pressed={mode === "archived"}
            disabled={opening}
            onClick={() => {
              setMode("archived");
              setOpenError("");
            }}
          >
            {t("Archived")}
          </button>
        </div>
        <ul className="workspace-results">
          {groups.map(({ chat, conversation, messages }) => {
            const title =
              chat.title === "New chat" ? t("New chat") : chat.title;
            const project = projects.find(({ id }) => id === chat.projectId);
            return (
              <li className="search-group" key={chat.id} aria-label={title}>
                <div className="search-group-heading">
                  {conversation ? (
                    <button
                      className="search-result-open search-conversation"
                      disabled={restoreState === "pending" || opening}
                      aria-label={`${title} · ${t("Conversation match")}${project ? ` · ${project.name}` : ""}`}
                      onClick={() => void choose(conversation)}
                    >
                      <MessageSquare size={16} aria-hidden="true" />
                      <span>
                        <strong>{highlighted(title, query)}</strong>
                        {project && (
                          <small>{highlighted(project.name, query)}</small>
                        )}
                        {query.trim() && <small>{t("Conversation match")}</small>}
                      </span>
                    </button>
                  ) : (
                    <div className="search-conversation search-group-label">
                      <MessageSquare size={16} aria-hidden="true" />
                      <span>
                        <strong>{title}</strong>
                        {project && <small>{project.name}</small>}
                      </span>
                    </div>
                  )}
                  {mode === "archived" && (
                    <button
                      className="icon"
                      aria-label={interpolate(t("Restore {name}"), title)}
                      disabled={
                        restoreDisabled || restoreState === "pending" || opening
                      }
                      onClick={async () => {
                        setRestoreState("pending");
                        field.current?.focus();
                        setRestoreState(
                          (await onRestore(chat.id)) ? "idle" : "failed",
                        );
                      }}
                    >
                      <ArchiveRestore size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {messages.length > 0 && (
                  <ul className="search-message-list">
                    {messages.map((result) => {
                      const message = result.message!;
                      const snippet = result.snippet ?? "";
                      const date = new Date(message.createdAt);
                      const validDate = Number.isFinite(date.getTime());
                      return (
                        <li key={message.id}>
                          <button
                            className="search-result-open search-message"
                            disabled={restoreState === "pending" || opening}
                            aria-label={`${title} · ${t("Message match")} · ${t(message.role === "user" ? "You" : "Luma Chat")} · ${snippet}${validDate ? ` · ${date.toLocaleString(locale)}` : ""}`}
                            onClick={() => void choose(result)}
                          >
                            <span className="search-message-body">
                              <span className="search-message-meta">
                                <span>
                                  {t(
                                    message.role === "user"
                                      ? "You"
                                      : "Luma Chat",
                                  )}
                                </span>
                                {validDate && (
                                  <time dateTime={date.toISOString()}>
                                    {date.toLocaleString(locale)}
                                  </time>
                                )}
                              </span>
                              <span className="search-message-snippet">
                                {highlighted(snippet, query)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {results.length > resultLimit && (
          <p className="hint" role="status">
            {t(
              "Showing the first 100 results. Refine your search to see more.",
            )}
          </p>
        )}
        {opening && (
          <p className="hint" role="status">
            {t("Opening search result…")}
          </p>
        )}
        {openError && (
          <p className="hint" role="alert">
            {t(openError)}
          </p>
        )}
        {restoreState !== "idle" && (
          <p className="hint" role="status">
            {t(
              restoreState === "pending"
                ? "Restoring conversation…"
                : "Restore was not saved. Try again.",
            )}
          </p>
        )}
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
