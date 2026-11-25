import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, MessageSquare, Search, X } from "lucide-react";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
import type { Conversation, WorkspaceProject } from "../types";
import { searchWorkspace, type WorkspaceSearchResult } from "../workspace";

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
    () => searchWorkspace(chats, query, mode === "archived", projects),
    [chats, query, mode, projects],
  );
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
          results[0]
        ) {
          event.preventDefault();
          void choose(results[0]);
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
          {results.map((result) => {
            const { chat, message, snippet } = result;
            const title =
              chat.title === "New chat" ? t("New chat") : chat.title;
            const project = projects.find(({ id }) => id === chat.projectId);
            return (
              <li
                className="search-result"
                key={JSON.stringify([chat.id, message?.id ?? null])}
              >
                <button
                  className="search-result-open"
                  disabled={restoreState === "pending" || opening}
                  aria-label={
                    message
                      ? `${title} · ${t("Message match")} · ${t(message.role === "user" ? "You" : "Luma Chat")} · ${snippet}${Number.isFinite(new Date(message.createdAt).getTime()) ? ` · ${new Date(message.createdAt).toLocaleString(locale)}` : ""}`
                      : `${title} · ${t("Conversation match")}${project ? ` · ${project.name}` : ""}`
                  }
                  onClick={() => void choose(result)}
                >
                  <MessageSquare size={16} aria-hidden="true" />
                  <span>
                    {title}
                    {project && <small>{project.name}</small>}
                    <small>
                      {message
                        ? `${t("Message match")} · ${t(message.role === "user" ? "You" : "Luma Chat")}`
                        : t("Conversation match")}
                    </small>
                    {message && (
                      <small className="search-message-snippet">
                        {snippet}
                      </small>
                    )}
                    {message &&
                      Number.isFinite(
                        new Date(message.createdAt).getTime(),
                      ) && (
                        <small>
                          <time
                            dateTime={new Date(message.createdAt).toISOString()}
                          >
                            {new Date(message.createdAt).toLocaleString(locale)}
                          </time>
                        </small>
                      )}
                  </span>
                </button>
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
              </li>
            );
          })}
        </ul>
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
