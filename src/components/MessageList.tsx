import { Paperclip, Sparkles, Trash2, Copy, UserRound, SquarePen, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { formatSize } from "../format-size";
import { translateNotice } from "../i18n";
import { copyMessage } from "../message-copy";
import type { Conversation, Message } from "../types";
import type { useWorkspace } from "../use-workspace";
import { Reasoning } from "./Reasoning";
import { RichMessage } from "./RichMessage";
import { ToolExecutionCard } from "./ToolExecutionCard";
import { ResponseInspector } from "./ResponseInspector";
import "../message-list.css";

export type MessageAction = { kind: "retry" | "edit" | "delete"; message: Message; chatId: string; anchor: HTMLElement };
type MessageWorkspace = Pick<ReturnType<typeof useWorkspace>, "t" | "locale" | "messagesContent" | "visibleMessages" | "searchMatch" | "activeReply" | "setNotice" | "replySave" | "conflicts" | "working" | "navigating" | "processingFiles" | "retryLocalSave" | "editMessage">;
export function MessageList({ workspace, chat, versions: versionGroupsMap, onAction, onSwitchVersion }: { workspace: MessageWorkspace; chat: Conversation; versions: Map<string, Message[]>; onAction: (action: MessageAction) => void; onSwitchVersion: (id: string) => Promise<void> }) {
  const { t, locale, messagesContent, visibleMessages, searchMatch, activeReply, setNotice, replySave, conflicts, working, navigating, processingFiles, retryLocalSave, editMessage } = workspace;
  return (
                <div className="messages" ref={messagesContent}>
                  {visibleMessages.map((m) => (
                    <article
                      className={`message ${m.role}`}
                      key={m.id}
                      data-message-id={m.id}
                      data-search-match={searchMatch?.chatId === chat.id && searchMatch.messageId === m.id || undefined}
                      tabIndex={-1}
                    >
                      {m.role === "user" && <div className="avatar"><UserRound size={19} aria-hidden="true" /></div>}
                      <div className="bubble">
                        <div className="message-meta">
                          {m.role === "assistant" && <span className="avatar assistant-avatar" aria-hidden="true"><Sparkles size={17} /></span>}
                          <strong>
                            {m.role === "assistant" ? t("Luma Chat") : t("You")}
                          </strong>
                          <time dateTime={Number.isFinite(new Date(m.createdAt).getTime()) ? new Date(m.createdAt).toISOString() : undefined} title={new Date(m.createdAt).toLocaleString(locale)}>
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
                            inProgress={
                              m.status === "streaming" &&
                              activeReply?.conversationId === chat.id &&
                              activeReply.phase === "streaming"
                            }
                            onNotice={setNotice}
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
                              onNotice={setNotice}
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
                            <span>{a.name} · {formatSize(a.size)}</span>
                          </div>
                        ))}
                        {m.status === "interrupted" && (
                          <div className="status-label">
                            {t("Stopped or interrupted")}
                          </div>
                        )}
                        {m.status === "error" && (
                          <div className="status-label response-error" role="status">
                            <strong>{t("Response failed")}</strong>
                            {m.error && <span>{translateNotice(locale, m.error)}</span>}
                          </div>
                        )}
                        {m.role === "assistant" &&
                          m.status &&
                          m.status !== "streaming" && (
                            <div
                              className="status-label"
                              role={
                                replySave?.message === m ? "status" : undefined
                              }
                            >
                              {replySave?.message !== m ? (
                                t(
                                  conflicts.has(chat.id)
                                    ? "From this tab’s version"
                                    : "Saved locally",
                                )
                              ) : replySave.status === "pending" ? (
                                t("Saving reply locally…")
                              ) : (
                                <>
                                  <span>{t("Reply not saved locally.")}</span>
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={
                                      working ||
                                      navigating ||
                                      conflicts.has(chat.id)
                                    }
                                    onClick={() => retryLocalSave(m)}
                                  >
                                    {t("Retry local save")}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        <div className="message-actions">
                        {(versionGroupsMap.get(m.id)?.length ?? 0) > 1 && (() => {
                          const versions = versionGroupsMap.get(m.id)!;
                          const index = versions.findIndex((version) => version.id === m.id);
                          return <div className="branch-control" aria-label={`${t("Message versions")} ${index + 1} / ${versions.length}`} role="group" tabIndex={-1}>
                            <button type="button" className="message-action" title={t("Previous version")} aria-label={t("Previous version")} disabled={index <= 0 || working || navigating || processingFiles || Boolean(replySave) || Boolean(chat.editState) || conflicts.has(chat.id)} onClick={() => void onSwitchVersion(versions[index - 1].id)}><ChevronLeft size={16} aria-hidden="true" /></button>
                            <span aria-live="polite">{index + 1} / {versions.length}</span>
                            <button type="button" className="message-action" title={t("Next version")} aria-label={t("Next version")} disabled={index >= versions.length - 1 || working || navigating || processingFiles || Boolean(replySave) || Boolean(chat.editState) || conflicts.has(chat.id)} onClick={() => void onSwitchVersion(versions[index + 1].id)}><ChevronRight size={16} aria-hidden="true" /></button>
                          </div>;
                        })()}
                        {m.role === "assistant" && m.status !== "streaming" &&
                          replySave?.message !== m && (
                              <button
                                className="message-action"
                                type="button"
                                title={t("Retry")}
                                disabled={working || navigating || processingFiles || Boolean(replySave) || Boolean(chat.editState) || conflicts.has(chat.id)}
                                onClick={(event) => onAction({ kind: "retry", message: m, chatId: chat.id, anchor: event.currentTarget })}
                              >
                                <RefreshCw size={16} aria-hidden="true" />
                                {t("Retry")}
                              </button>
                          )}
                        {m.role === "user" && (
                          <button type="button" className="message-action" title={t("Edit as new message")} disabled={working || navigating || processingFiles || Boolean(replySave) || conflicts.has(chat.id)} onClick={(event) => {
                            if (chat.draft.length || chat.draftAttachments?.length) onAction({ kind: "edit", message: m, chatId: chat.id, anchor: event.currentTarget });
                            else void editMessage(m);
                          }}>
                            <SquarePen size={14} aria-hidden="true" /> {t("Edit as new message")}
                          </button>
                        )}
                        {m.content && (
                          <button
                            className="message-action"
                            title={t("Copy")}
                            onClick={() => void copyMessage(m, setNotice)}
                          >
                            <Copy size={14} />
                            {t(" Copy")}
                          </button>
                        )}
                        <button type="button" className="message-action" title={t("Delete branch")} aria-label={t("Delete branch")} disabled={working || navigating || processingFiles || Boolean(replySave) || Boolean(chat.editState) || conflicts.has(chat.id)} onClick={(event) => onAction({ kind: "delete", message: m, chatId: chat.id, anchor: event.currentTarget })}><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                        {m.role === "assistant" && (
                          <ResponseInspector message={m} locale={locale} />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
  );
}
