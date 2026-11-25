import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUp,
  FileText,
  Lock,
  Maximize2,
  Minimize2,
  Plus,
  Square,
  X,
} from "lucide-react";
import { interpolate, translate, translateNotice } from "../i18n";
import type { Locale } from "../i18n";
import { formatSize } from "../format-size";
import type { Attachment } from "../types";

import type { ActiveReply } from "../workspace-state";
import { slashCommands } from "../slash-commands";
import type { SlashCommand } from "../slash-commands";

export type ReplyPhase = "idle" | ActiveReply["phase"];

type Props = {
  locale: Locale;
  enabled: boolean;
  enterSends: boolean;
  draft: string;
  files: Attachment[];
  processingFiles: boolean;
  phase: ReplyPhase;
  blockedReason?: string;
  compatibilityHint?: string;
  editing: boolean;
  editingCanCancel: boolean;
  onCancelEdit: () => void;
  notice: string;
  onDismissNotice: () => void;
  modelControl: ReactNode;
  commandsEnabled: boolean;
  onCommand: (command: SlashCommand) => void;
  onDraft: (draft: string) => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function Composer({
  locale,
  enabled,
  enterSends,
  draft,
  files,
  processingFiles,
  phase,
  blockedReason,
  compatibilityHint,
  editing,
  editingCanCancel,
  onCancelEdit,
  notice,
  onDismissNotice,
  modelControl,
  commandsEnabled,
  onCommand,
  onDraft,
  onFiles,
  onRemove,
  onSend,
  onStop,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const shell = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const lastComposition = useRef(-Infinity);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const commandListId = useId();
  const hintId = useId();
  const statusId = useId();
  const attachmentHelpId = useId();
  const compatibilityHintId = useId();
  const [dismissedDraft, setDismissedDraft] = useState<string>();
  const [selectedCommand, setSelectedCommand] = useState(0);
  const commandQuery = /^\/([a-z]*)$/i.exec(draft);
  const matches =
    commandsEnabled && commandQuery && draft !== dismissedDraft
      ? slashCommands.filter(({ name }) =>
          name.startsWith(commandQuery[1].toLowerCase()),
        )
      : [];
  const commandIndex = Math.min(selectedCommand, matches.length - 1);
  const executeCommand = (command: SlashCommand) => {
    onDraft("");
    setDismissedDraft(undefined);
    setSelectedCommand(0);
    onCommand(command);
  };
  const canAttach = enabled && phase === "idle" && !processingFiles;
  const canSend =
    canAttach && !blockedReason && Boolean(draft.trim() || files.length);
  const stopping = phase === "stopping";
  const saving = phase === "saving";
  const busyLabel = saving ? t("Saving message…") : t("Stopping…");
  const toggleExpanded = () => {
    const input = textarea.current;
    const start = input?.selectionStart ?? 0;
    const end = input?.selectionEnd ?? start;
    setExpanded((previous) => !previous);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start, end);
    });
  };

  useLayoutEffect(() => {
    if (!expanded || !shell.current) return;
    const app = shell.current.closest<HTMLElement>(".app");
    if (!app) return;
    const previous = new Map<HTMLElement, boolean>();
    let child: HTMLElement = shell.current;
    while (child !== app && child.parentElement) {
      const parent = child.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== child && sibling instanceof HTMLElement) {
          previous.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      child = parent;
    }
    return () => {
      for (const [element, inert] of previous) element.inert = inert;
    };
  }, [expanded]);

  useEffect(() => {
    shell.current
      ?.querySelector('[role="option"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedCommand, matches.length]);

  const resize = () => {
    const input = textarea.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  useLayoutEffect(resize, [draft]);
  useLayoutEffect(() => {
    if (!shell.current) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resize();
    });
    observer.observe(shell.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const app = shell.current?.closest<HTMLElement>(".app");
    if (enterSends || !viewport || !app) return;
    const update = () => {
      const focused = document.activeElement;
      const keyboardTarget =
        focused === textarea.current ||
        (focused instanceof HTMLInputElement &&
          Boolean(focused.closest(".model-dialog[open]")));
      const keyboardVisible =
        keyboardTarget &&
        viewport.scale === 1 &&
        window.innerHeight - viewport.height > 64;
      if (keyboardVisible) {
        app.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      } else {
        app.style.removeProperty("--app-viewport-height");
      }
    };
    viewport.addEventListener("resize", update);
    app.addEventListener("focusin", update);
    app.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      app.removeEventListener("focusin", update);
      app.removeEventListener("focusout", update);
      app.style.removeProperty("--app-viewport-height");
    };
  }, [enterSends]);

  return (
    <div className="composer-wrap">
      {expanded && <div className="composer-backdrop" aria-hidden="true" />}
      <form
        className="composer"
        ref={shell}
        data-expanded={expanded}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
        aria-label={expanded ? t("Expanded message editor") : undefined}
        data-dragging={dragging && canAttach}
        onSubmit={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (
            !expanded ||
            (event.target as HTMLElement).closest("dialog[open]")
          )
            return;
          if (event.key === "Escape" && !matches.length) {
            event.preventDefault();
            toggleExpanded();
          }
          if (event.key === "Tab") {
            const items = Array.from(
              shell.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], input:not([type="hidden"]):not(:disabled)',
              ) || [],
            ).filter((item) => item.offsetParent !== null);
            if (!items.length) return;
            if (event.shiftKey && document.activeElement === items[0]) {
              event.preventDefault();
              items[items.length - 1].focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === items[items.length - 1]
            ) {
              event.preventDefault();
              items[0].focus();
            }
          }
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = canAttach ? "copy" : "none";
          setDragging(canAttach);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setDragging(false);
        }}
        onDrop={(event) => {
          setDragging(false);
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          if (canAttach) onFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {editing && (
          <div className="editing-banner">
            <span>
              {t("Editing a previous message. The original stays in the chat.")}
            </span>
            <button
              type="button"
              className="message-action"
              disabled={!enabled || !editingCanCancel}
              onClick={onCancelEdit}
            >
              {t("Cancel edit")}
            </button>
          </div>
        )}
        {enterSends && (
          <span id={hintId} className="visually-hidden">
            {t("Enter to send · Shift+Enter for a new line")}
          </span>
        )}
        {matches.length > 0 && (
          <div className="slash-menu">
            <div className="slash-menu-heading">
              <span>{t("Slash commands")}</span>
              <button
                type="button"
                className="icon"
                aria-label={t("Close slash commands")}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setDismissedDraft(draft)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div
              role="listbox"
              id={commandListId}
              aria-label={t("Slash commands")}
            >
              {matches.map((command, index) => (
                <button
                  key={command.name}
                  id={`${commandListId}-${command.name}`}
                  type="button"
                  role="option"
                  aria-selected={index === commandIndex}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => executeCommand(command.name)}
                >
                  <strong>/{command.name}</strong>
                  <span>{t(command.description)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <span className="visually-hidden" role="status" aria-atomic="true">
          {files.length
            ? `${t("Attachments")} · ${files.length}`
            : t("No attachments")}
        </span>
        {files.length > 0 && (
          <section className="attachment-area" aria-label={t("Attachments")}>
            <div className="attachment-heading" aria-hidden="true">
              {t("Attachments")} · {files.length}
            </div>
            <ul className="file-list">
              {files.map((file) => (
                <li className="file-chip" key={file.id}>
                  {/^data:image\/(png|jpeg|gif|webp);base64,/i.test(
                    file.data,
                  ) && file.mime.startsWith("image/") ? (
                    <img
                      src={file.data}
                      alt=""
                      width={36}
                      height={36}
                      decoding="async"
                    />
                  ) : (
                    <FileText size={18} aria-hidden="true" />
                  )}
                  <span className="file-details">
                    <span className="file-name" title={file.name}>
                      {file.name}
                    </span>
                    <small>
                      {t(
                        file.mime.startsWith("image/")
                          ? "Image attachment"
                          : "Text attachment",
                      )}{" "}
                      · {formatSize(file.size)}
                    </small>
                  </span>
                  <button
                    className="icon"
                    type="button"
                    disabled={!enabled || saving}
                    aria-label={interpolate(t("Remove {name}"), file.name)}
                    title={interpolate(t("Remove {name}"), file.name)}
                    onClick={(event) => {
                      const item = event.currentTarget.closest("li");
                      const next =
                        item?.nextElementSibling?.querySelector<HTMLButtonElement>(
                          "button",
                        ) ??
                        item?.previousElementSibling?.querySelector<HTMLButtonElement>(
                          "button",
                        );
                      onRemove(file.id);
                      (next ?? textarea.current)?.focus();
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(processingFiles || blockedReason || saving || stopping) && (
          <p id={statusId} className="composer-status" role="status">
            {processingFiles
              ? t("Preparing attachments…")
              : saving || stopping
                ? busyLabel
                : t(blockedReason || "")}
          </p>
        )}
        {compatibilityHint && (
          <p id={compatibilityHintId} className="composer-status" role="status">
            {t(compatibilityHint)}
          </p>
        )}
        {expanded && notice && (
          <div className="composer-notice">
            <span role="status">{translateNotice(locale, notice)}</span>
            <button
              type="button"
              className="icon"
              aria-label={t("Dismiss message")}
              onClick={onDismissNotice}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          className="icon composer-expand"
          type="button"
          aria-label={t(
            expanded ? "Close expanded editor" : "Expand message editor",
          )}
          title={t(
            expanded ? "Close expanded editor" : "Expand message editor",
          )}
          onClick={toggleExpanded}
        >
          {expanded ? (
            <Minimize2 size={18} aria-hidden="true" />
          ) : (
            <Maximize2 size={18} aria-hidden="true" />
          )}
        </button>
        <textarea
          ref={textarea}
          rows={1}
          placeholder={t("Ask anything...")}
          aria-label={t("Message")}
          aria-describedby={
            [
              enterSends ? hintId : undefined,
              compatibilityHint ? compatibilityHintId : undefined,
              processingFiles || blockedReason || saving || stopping
                ? statusId
                : undefined,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-autocomplete="list"
          aria-controls={matches.length ? commandListId : undefined}
          aria-activedescendant={
            matches.length
              ? `${commandListId}-${matches[commandIndex].name}`
              : undefined
          }
          value={draft}
          disabled={!enabled}
          readOnly={saving}
          enterKeyHint={enterSends ? "send" : "enter"}
          onChange={(event) => {
            setSelectedCommand(0);
            setDismissedDraft(undefined);
            onDraft(event.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
            lastComposition.current = performance.now();
          }}
          onKeyDown={(event) => {
            if (
              composing.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229 ||
              performance.now() - lastComposition.current < 100
            )
              return;
            if (
              matches.length &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey
            ) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setSelectedCommand(
                  (commandIndex + direction + matches.length) % matches.length,
                );
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDismissedDraft(draft);
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                executeCommand(matches[commandIndex].name);
                return;
              }
            }
            if (
              !enterSends ||
              event.key !== "Enter" ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            if (phase !== "idle") return;
            event.preventDefault();
            if (canSend) onSend();
          }}
          onPaste={(event) => {
            if (!canAttach) return;
            const images = Array.from(event.clipboardData.items)
              .filter(
                (item) =>
                  item.kind === "file" && item.type.startsWith("image/"),
              )
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (!images.length)
              images.push(
                ...Array.from(event.clipboardData.files).filter((file) =>
                  file.type.startsWith("image/"),
                ),
              );
            if (!images.length) return;
            if (!event.clipboardData.getData("text/plain"))
              event.preventDefault();
            onFiles(images);
          }}
        />
        <div className="composer-actions">
          <button
            className="icon composer-attach"
            type="button"
            title={t("Attach images or text files · 5 MB per file")}
            aria-label={t("Attach image or text")}
            aria-describedby={attachmentHelpId}
            onClick={() => fileInput.current?.click()}
            disabled={!canAttach}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <span id={attachmentHelpId} className="visually-hidden">
            {t(
              "Choose images or text files up to 5 MB each, or drag and drop files here. You can also paste images.",
            )}
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,text/*,.md,.csv,.json"
            multiple
            hidden
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files || []);
              event.currentTarget.value = "";
              if (canAttach) onFiles(selected);
            }}
          />
          {modelControl}
          {phase === "streaming" || stopping ? (
            <button
              className="send"
              type="button"
              aria-label={stopping ? busyLabel : t("Stop generating")}
              disabled={stopping}
              onClick={onStop}
            >
              <Square size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="send"
              type="button"
              aria-label={
                matches.length
                  ? t("Run command")
                  : phase === "finalizing"
                    ? t("Saving reply locally…")
                    : saving
                      ? busyLabel
                      : t("Send message")
              }
              disabled={!canSend && !matches.length}
              onClick={() =>
                matches.length
                  ? executeCommand(matches[commandIndex].name)
                  : onSend()
              }
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
      <p className="privacy">
        <span>
          <Lock size={13} aria-hidden="true" />
          {t(
            "Chats are stored on this device. Content is sent to your selected provider.",
          )}
        </span>
      </p>
      {enterSends && (
        <p className="composer-hint" aria-hidden="true">
          {t("Enter to send · Shift+Enter for a new line")}
        </p>
      )}
    </div>
  );
}
