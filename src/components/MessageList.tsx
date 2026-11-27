import { memo, useLayoutEffect, useMemo, useRef } from "react";
import {
  Paperclip,
  Sparkles,
  Trash2,
  Copy,
  UserRound,
  SquarePen,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatSize } from "../format-size";
import { translate, translateNotice, type Locale } from "../i18n";
import { copyMessage } from "../message-copy";
import type { Conversation, Message } from "../types";
import type { useWorkspace } from "../use-workspace";
import { Reasoning } from "./Reasoning";
import { RichMessage } from "./RichMessage";
import { ToolExecutionCard } from "./ToolExecutionCard";
import { ResponseInspector } from "./ResponseInspector";
import { useVirtualMessages } from "../use-virtual-messages";
import { virtualMessageSegments } from "../virtual-message-layout";
import "../message-list.css";

export type MessageAction = {
  kind: "retry" | "edit" | "delete";
  message: Message;
  chatId: string;
  anchor: HTMLElement;
};
type MessageWorkspace = Pick<
  ReturnType<typeof useWorkspace>,
  | "t"
  | "locale"
  | "messagesContent"
  | "conversation"
  | "followReply"
  | "visibleMessages"
  | "searchMatch"
  | "searchMode"
  | "activeReply"
  | "setNotice"
  | "replySave"
  | "conflicts"
  | "working"
  | "navigating"
  | "processingFiles"
  | "retryLocalSave"
  | "editMessage"
>;

type RowActions = {
  onAction: (action: MessageAction) => void;
  onSwitchVersion: (id: string) => Promise<void>;
  retryLocalSave: MessageWorkspace["retryLocalSave"];
  editOrConfirm: (message: Message, anchor: HTMLElement) => void;
};

type RowProps = {
  message: Message;
  chatId: string;
  locale: Locale;
  searchMatch: boolean;
  inProgress: boolean;
  conflict: boolean;
  working: boolean;
  navigating: boolean;
  processingFiles: boolean;
  hasReplySave: boolean;
  saveStatus?: "pending" | "failed";
  editing: boolean;
  versionIndex: number;
  versionCount: number;
  previousVersion?: string;
  nextVersion?: string;
  onNotice: MessageWorkspace["setNotice"];
  actions: RowActions;
};

const MessageRow = memo(function MessageRow({
  message: m,
  chatId,
  locale,
  searchMatch,
  inProgress,
  conflict,
  working,
  navigating,
  processingFiles,
  hasReplySave,
  saveStatus,
  editing,
  versionIndex,
  versionCount,
  previousVersion,
  nextVersion,
  onNotice,
  actions,
}: RowProps) {
  const t = (text: string) => translate(locale, text);
  const disabled =
    working ||
    navigating ||
    processingFiles ||
    hasReplySave ||
    editing ||
    conflict;
  return (
    <article
      className={`message ${m.role}`}
      data-message-id={m.id}
      data-search-match={searchMatch || undefined}
      tabIndex={-1}
    >
      {m.role === "user" && (
        <div className="avatar">
          <UserRound size={19} aria-hidden="true" />
        </div>
      )}
      <div className="bubble">
        <div className="message-meta">
          {m.role === "assistant" && (
            <span className="avatar assistant-avatar" aria-hidden="true">
              <Sparkles size={17} />
            </span>
          )}
          <strong>{m.role === "assistant" ? t("Luma Chat") : t("You")}</strong>
          <time
            dateTime={
              Number.isFinite(new Date(m.createdAt).getTime())
                ? new Date(m.createdAt).toISOString()
                : undefined
            }
            title={new Date(m.createdAt).toLocaleString(locale)}
          >
            {new Date(m.createdAt).toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        {m.reasoning && (
          <Reasoning
            locale={locale}
            text={m.reasoning}
            streaming={m.status === "streaming"}
            inProgress={inProgress}
            onNotice={onNotice}
          />
        )}
        {m.toolExecutions?.map((execution) => (
          <ToolExecutionCard
            key={execution.id}
            execution={execution}
            locale={locale}
          />
        ))}
        {m.content ? (
          <div className="message-answer">
            <RichMessage
              text={m.content}
              locale={locale}
              preserveLineBreaks={m.role === "user"}
              streaming={m.status === "streaming"}
              onNotice={onNotice}
            />
          </div>
        ) : m.status === "streaming" &&
          !m.reasoning &&
          !m.toolExecutions?.length ? (
          <p className="muted">{t("Thinking…")}</p>
        ) : null}
        {m.attachments?.map((a) => (
          <div className="attachment-label" key={a.id}>
            <Paperclip size={14} aria-hidden="true" />
            <span>
              {a.name} · {formatSize(a.size)}
            </span>
          </div>
        ))}
        {m.status === "interrupted" && (
          <div className="status-label">{t("Stopped or interrupted")}</div>
        )}
        {m.status === "error" && (
          <div className="status-label response-error" role="status">
            <strong>{t("Response failed")}</strong>
            {m.error && <span>{translateNotice(locale, m.error)}</span>}
          </div>
        )}
        {m.role === "assistant" && m.status && m.status !== "streaming" && (
          <div
            className="status-label"
            role={saveStatus ? "status" : undefined}
          >
            {!saveStatus ? (
              t(conflict ? "From this tab’s version" : "Saved locally")
            ) : saveStatus === "pending" ? (
              t("Saving reply locally…")
            ) : (
              <>
                <span>{t("Reply not saved locally.")}</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={working || navigating || conflict}
                  onClick={() => actions.retryLocalSave(m)}
                >
                  {t("Retry local save")}
                </button>
              </>
            )}
          </div>
        )}
        <div className="message-actions">
          {versionCount > 1 && (
            <div
              className="branch-control"
              aria-label={`${t("Message versions")} ${versionIndex + 1} / ${versionCount}`}
              role="group"
              tabIndex={-1}
            >
              <button
                type="button"
                className="message-action"
                title={t("Previous version")}
                aria-label={t("Previous version")}
                disabled={!previousVersion || disabled}
                onClick={() => {
                  if (previousVersion)
                    void actions.onSwitchVersion(previousVersion);
                }}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span aria-live="polite">
                {versionIndex + 1} / {versionCount}
              </span>
              <button
                type="button"
                className="message-action"
                title={t("Next version")}
                aria-label={t("Next version")}
                disabled={!nextVersion || disabled}
                onClick={() => {
                  if (nextVersion) void actions.onSwitchVersion(nextVersion);
                }}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {m.role === "assistant" &&
            m.status !== "streaming" &&
            !saveStatus && (
              <button
                className="message-action"
                type="button"
                title={t("Retry")}
                disabled={disabled}
                onClick={(event) =>
                  actions.onAction({
                    kind: "retry",
                    message: m,
                    chatId,
                    anchor: event.currentTarget,
                  })
                }
              >
                <RefreshCw size={16} aria-hidden="true" />
                {t("Retry")}
              </button>
            )}
          {m.role === "user" && (
            <button
              type="button"
              className="message-action"
              title={t("Edit as new message")}
              disabled={
                working ||
                navigating ||
                processingFiles ||
                hasReplySave ||
                conflict
              }
              onClick={(event) => actions.editOrConfirm(m, event.currentTarget)}
            >
              <SquarePen size={14} aria-hidden="true" />{" "}
              {t("Edit as new message")}
            </button>
          )}
          {m.content && (
            <button
              className="message-action"
              title={t("Copy")}
              onClick={() => void copyMessage(m, onNotice)}
            >
              <Copy size={14} />
              {t(" Copy")}
            </button>
          )}
          <button
            type="button"
            className="message-action"
            title={t("Delete branch")}
            aria-label={t("Delete branch")}
            disabled={disabled}
            onClick={(event) =>
              actions.onAction({
                kind: "delete",
                message: m,
                chatId,
                anchor: event.currentTarget,
              })
            }
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
        {m.role === "assistant" && (
          <ResponseInspector message={m} locale={locale} />
        )}
      </div>
    </article>
  );
});

export function MessageList({
  workspace,
  chat,
  versions: versionGroupsMap,
  onAction,
  onSwitchVersion,
  virtualEnabled,
  virtualRequested,
  retainedIds,
  onRetain,
}: {
  workspace: MessageWorkspace;
  chat: Conversation;
  versions: Map<string, Message[]>;
  onAction: (action: MessageAction) => void;
  onSwitchVersion: (id: string) => Promise<void>;
  virtualEnabled: boolean;
  virtualRequested: boolean;
  retainedIds: ReadonlySet<string>;
  onRetain: (id: string) => void;
}) {
  const {
    locale,
    messagesContent,
    conversation,
    followReply,
    visibleMessages,
    searchMatch,
    searchMode,
    activeReply,
    setNotice,
    replySave,
    conflicts,
    working,
    navigating,
    processingFiles,
    retryLocalSave,
    editMessage,
  } = workspace;
  const latest = useRef({
    onAction,
    onSwitchVersion,
    retryLocalSave,
    editMessage,
    chat,
  });
  useLayoutEffect(() => {
    latest.current = {
      onAction,
      onSwitchVersion,
      retryLocalSave,
      editMessage,
      chat,
    };
  });
  const actions = useMemo<RowActions>(
    () => ({
      onAction: (value) => latest.current.onAction(value),
      onSwitchVersion: (id) => latest.current.onSwitchVersion(id),
      retryLocalSave: (message) => latest.current.retryLocalSave(message),
      editOrConfirm: (message, anchor) => {
        const current = latest.current;
        if (current.chat.draft.length || current.chat.draftAttachments?.length)
          current.onAction({
            kind: "edit",
            message,
            chatId: current.chat.id,
            anchor,
          });
        else void current.editMessage(message);
      },
    }),
    [],
  );
  const conflict = conflicts.has(chat.id);
  const searchTarget = !searchMode && searchMatch?.chatId === chat.id ? searchMatch : undefined;
  const windowed = useVirtualMessages({ enabled: virtualEnabled, chatId: chat.id, messages: visibleMessages, pane: conversation, content: messagesContent, follow: followReply, searchTarget });
  const focusedSearch = useRef(0);
  useLayoutEffect(() => {
    if (!searchTarget || focusedSearch.current === searchTarget.sequence) return;
    const target = Array.from(messagesContent.current?.querySelectorAll<HTMLElement>("[data-message-id]") ?? []).find((element) => element.dataset.messageId === searchTarget.messageId);
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      if (!target.isConnected) return;
      focusedSearch.current = searchTarget.sequence;
      target.scrollIntoView({ block: "center", behavior: "auto" });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchTarget, windowed?.range.start, windowed?.range.end, messagesContent]);
  const retainedIndexes = new Set<number>();
  visibleMessages.forEach((message, index) => { if (retainedIds.has(message.id)) retainedIndexes.add(index); });
  const segments = windowed ? virtualMessageSegments(windowed.heights, windowed.range, retainedIndexes) : [{ kind: "rows" as const, start: 0, end: visibleMessages.length }];
  const renderedMessages = segments.flatMap<{ message: Message } | { gap: { start: number; height: number } }>((segment) => segment.kind === "rows" ? visibleMessages.slice(segment.start, segment.end).map((message) => ({ message })) : [{ gap: segment }]);
  const retainTarget = (target: EventTarget) => {
    if (!virtualRequested || !(target instanceof Element)) return;
    const row = target.closest<HTMLElement>("[data-message-id]");
    if (row?.dataset.messageId) onRetain(row.dataset.messageId);
  };
  return (
    <div className="messages" ref={messagesContent} data-virtualized={Boolean(windowed)} data-message-count={visibleMessages.length} onFocusCapture={(event) => retainTarget(event.target)} onPointerDownCapture={(event) => { if ((event.target as Element).closest("button, summary, a, input, select, textarea, [role='button']")) retainTarget(event.target); }} onClickCapture={(event) => { if ((event.target as Element).closest("button, summary, a, input, select, textarea, [role='button']")) retainTarget(event.target); }}>
      <div aria-hidden="true" className="virtual-spacer" style={{ height: 0 }} />
      {renderedMessages.map((item) => {
        if ("gap" in item) return <div key={`gap-${item.gap.start}`} aria-hidden="true" className="virtual-spacer" style={{ height: item.gap.height }} />;
        const message = item.message;
        const versions = versionGroupsMap.get(message.id);
        const versionIndex =
          versions?.findIndex((version) => version.id === message.id) ?? -1;
        return (
          <MessageRow
            key={message.id}
            message={message}
            chatId={chat.id}
            locale={locale}
            searchMatch={
              searchMatch?.chatId === chat.id &&
              searchMatch.messageId === message.id
            }
            inProgress={
              message.status === "streaming" &&
              activeReply?.conversationId === chat.id &&
              activeReply.phase === "streaming"
            }
            conflict={conflict}
            working={working}
            navigating={navigating}
            processingFiles={processingFiles}
            hasReplySave={Boolean(replySave)}
            saveStatus={
              replySave?.message === message ? replySave.status : undefined
            }
            editing={Boolean(chat.editState)}
            versionIndex={versionIndex}
            versionCount={versions?.length ?? 0}
            previousVersion={versions?.[versionIndex - 1]?.id}
            nextVersion={versions?.[versionIndex + 1]?.id}
            onNotice={setNotice}
            actions={actions}
          />
        );
      })}
      <div aria-hidden="true" className="virtual-spacer" style={{ height: 0 }} />
    </div>
  );
}
