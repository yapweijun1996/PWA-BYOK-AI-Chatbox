import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUp, FileText, Lock, Plus, Square, X } from "lucide-react";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
import { formatSize } from "../format-size";
import type { Attachment } from "../types";

export type ReplyPhase = "idle" | "saving" | "streaming" | "stopping";

type Props = {
  locale: Locale;
  enabled: boolean;
  enterSends: boolean;
  draft: string;
  files: Attachment[];
  processingFiles: boolean;
  phase: ReplyPhase;
  blockedReason?: string;
  modelControl: ReactNode;
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
  modelControl,
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
  const canAttach = enabled && phase === "idle" && !processingFiles;
  const canSend =
    canAttach && !blockedReason && Boolean(draft.trim() || files.length);
  const stopping = phase === "stopping";
  const saving = phase === "saving";
  const busyLabel = saving ? t("Saving message…") : t("Stopping…");

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
      <form
        className="composer"
        ref={shell}
        data-dragging={dragging && canAttach}
        onSubmit={(event) => event.preventDefault()}
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
        {files.length > 0 && (
          <div className="file-list">
            {files.map((file) => (
              <div className="file-chip" key={file.id}>
                {/^data:image\/(png|jpeg|gif|webp);base64,/i.test(file.data) &&
                file.mime.startsWith("image/") ? (
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
                  disabled={saving}
                  aria-label={interpolate(t("Remove {name}"), file.name)}
                  onClick={() => onRemove(file.id)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        {(processingFiles || blockedReason || saving || stopping) && (
          <p className="composer-status" role="status">
            {processingFiles
              ? t("Preparing attachments…")
              : saving || stopping
                ? busyLabel
                : t(blockedReason || "")}
          </p>
        )}
        <textarea
          ref={textarea}
          rows={1}
          placeholder={t("Ask anything...")}
          aria-label={t("Message")}
          value={draft}
          disabled={!enabled}
          readOnly={saving}
          enterKeyHint={enterSends ? "send" : "enter"}
          onChange={(event) => onDraft(event.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
            lastComposition.current = performance.now();
          }}
          onKeyDown={(event) => {
            if (
              !enterSends ||
              event.key !== "Enter" ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              composing.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229 ||
              performance.now() - lastComposition.current < 100
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
            title={t("Attach image or text")}
            aria-label={t("Attach image or text")}
            onClick={() => fileInput.current?.click()}
            disabled={!canAttach}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
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
              <Square size={17} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="send"
              type="button"
              aria-label={saving ? busyLabel : t("Send message")}
              disabled={!canSend}
              onClick={onSend}
            >
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
      <p className="privacy">
        <Lock size={13} aria-hidden="true" />
        <span>
          {t(
            "Chats are stored on this device. Content is sent to your selected provider.",
          )}
        </span>
      </p>
    </div>
  );
}
