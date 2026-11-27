import { effortFor, effortOptions } from "./reasoning-effort";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Brain,
  Code2,
  ChevronDown,
  ArrowDown,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceSearch } from "./components/WorkspaceSearch";
import { WorkspaceInspector } from "./components/WorkspaceInspector";
import { Composer } from "./components/Composer";
import { ModelSelector } from "./components/ModelSelector";
import { HistorySharingDialog } from "./components/HistorySharingDialog";
import { MessageActionDialog } from "./components/MessageActionDialog";
import { requiresLunaToolCompatibility } from "./provider-request";
import { Topbar } from "./components/Topbar";
import { MessageList, type MessageAction } from "./components/MessageList";
import { useConversationAlignment } from "./use-conversation-alignment";
import { virtualMessageThreshold } from "./virtual-message-layout";
import { sidebarPreferencesCleared } from "./sidebar-preferences";
import { branchDescendants, versionGroups } from "./branches";
import type { InitialAppState } from "./startup";

import type { Message } from "./types";
import { useWorkspace } from "./use-workspace";
import { SettingsView } from "./components/SettingsView";
import type { SlashCommand } from "./slash-commands";
import "./generated/tokens-light.css";
import "./generated/tokens-dark.css";
import "./generated/oklch-light.css";
import "./generated/oklch-dark.css";
import "./styles.css";
import "./workspace.css";

function App({
  initial,
  onInitialCommit,
}: {
  initial: InitialAppState;
  onInitialCommit: () => void;
}) {
  const workspace = useWorkspace({ initial, onInitialCommit });
  const toolsHelpId = useId();
  const [messageAction, setMessageAction] = useState<MessageAction>();
  const [virtualExperiment, setVirtualExperimentState] = useState(() => {
    try { return sessionStorage.getItem("luma:virtual-experiment") === "1"; } catch { return false; }
  });
  const setVirtualExperiment = useCallback((value: boolean) => {
    setVirtualExperimentState(value);
    try { if (value) sessionStorage.setItem("luma:virtual-experiment", "1"); else sessionStorage.removeItem("luma:virtual-experiment"); } catch { /* The experiment still works for this page. */ }
  }, []);
  useEffect(() => { const clear = () => setVirtualExperiment(false); window.addEventListener(sidebarPreferencesCleared, clear); return () => window.removeEventListener(sidebarPreferencesCleared, clear); }, [setVirtualExperiment]);
  const {
    locale,
    t,
    threads,
    active,
    view,
    working,
    processingFiles,
    navigating,
    desktop,
    mobileDrawer,
    settings,
    searchMode,
    setSearchMode,
    conversation,
    closeDrawer,
    create,
    choose,
    openSearchResult,
    searchMatch,
    clearSearchMatch,
    openSettings,
    saveSettings,
    organizeChat,
    conflicts,
    keepConflictCopy,
    replySave,
    remove,
    saveProject,
    deleteProject,
    chat,
    config,
    selectedModel,
    inspecting,
    setInspecting,
    setNotice,
    onMessageScroll,
    markScrollIntent,
    showJumpToLatest,
    jumpToLatest,
    retry,
    visibleMessages,
    changeBranch,
    editMessage,
    cancelEdit,
    desktopInput,
    displayedDraft,
    phase,
    composerBlocked,
    modelGroups,
    loadCatalog,
    selectModel,
    reasoningAvailable,
    reasoningLabel,
    javascriptEnabled,
    toggleJavaScript,
    setReasoning,
    setModelEffort,
    editDraft,
    processFiles,
    removeDraftFile,
    send,
    stopReply,
    showingSettings,
    historyTarget,
    finishHistoryChoice,
    effective,
    activeReply,
    online,
    credentialState,
    effectiveTheme,
    originStorage,
    getBufferedDrafts,
    pwa,
    redact,
  } = workspace;
  const messageVersions = useMemo<Map<string, Message[]>>(() => chat ? versionGroups(chat) : new Map(), [chat?.id, chat?.messages, chat?.branchVersion]);
  const [interactionChat, setInteractionChat] = useState<string | null>(null);
  const interactionHold = interactionChat === active;
  const copyConversation = async () => {
    try {
      await navigator.clipboard.writeText(visibleMessages.map((message) => message.content).filter(Boolean).join("\n\n"));
      setNotice("Copied.");
    } catch { setNotice("Copy unavailable."); }
  };
  const virtualEnabled = virtualExperiment && visibleMessages.length >= virtualMessageThreshold && typeof ResizeObserver !== "undefined" && !activeReply && !searchMode && !searchMatch && !messageAction && !chat?.editState && !interactionHold;
  useEffect(() => { if (activeReply && virtualExperiment) setVirtualExperiment(false); }, [activeReply, virtualExperiment, setVirtualExperiment]);
  useEffect(() => {
    if (!virtualExperiment) return;
    const selectionChanged = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && conversation.current?.contains(selection.anchorNode)) setInteractionChat(active);
    };
    document.addEventListener("selectionchange", selectionChanged);
    return () => document.removeEventListener("selectionchange", selectionChanged);
  }, [virtualExperiment, conversation, active]);
  const focusedSearchSequence = useRef(0);
  useConversationAlignment(view, conversation);
  useEffect(() => {
    if (!searchMatch) return;
    const timer = window.setTimeout(() => clearSearchMatch(searchMatch.sequence), 5000);
    return () => clearTimeout(timer);
  }, [searchMatch, clearSearchMatch]);
  useEffect(() => {
    if (!searchMatch || searchMode || active !== searchMatch.chatId || view !== "chat" || focusedSearchSequence.current === searchMatch.sequence) return;
    const frame = requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-message-id]")).find((element) => element.dataset.messageId === searchMatch.messageId);
      if (!target) return;
      focusedSearchSequence.current = searchMatch.sequence;
      target.scrollIntoView({ block: "center", behavior: "auto" });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchMatch, searchMode, active, view]);
  useLayoutEffect(() => {
    if (!pwa.applying) return;
    const blockInput = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", blockInput, true);
    return () => document.removeEventListener("keydown", blockInput, true);
  }, [pwa.applying]);
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const closeMessageAction = (restoreFocus: boolean) => {
    const anchor = messageAction?.anchor;
    setMessageAction(undefined);
    if (restoreFocus) requestAnimationFrame(() => anchor?.isConnected && anchor.focus());
  };
  const switchMessageVersion = async (messageId: string) => {
    await changeBranch(messageId);
    requestAnimationFrame(() => {
      const message = Array.from(document.querySelectorAll<HTMLElement>("[data-message-id]")).find((element) => element.dataset.messageId === messageId);
      message?.querySelector<HTMLElement>(".branch-control")?.focus();
    });
  };
  const runCommand = (command: SlashCommand) => {
    switch (command) {
      case "new":
        create();
        break;
      case "search":
        setSearchMode("active");
        break;
      case "model":
        modelTrigger.current?.click();
        break;
      case "settings":
        openSettings();
        break;
      case "js":
        toggleJavaScript();
        break;
    }
  };
  return (
    <div className="app">
      {(pwa.applying || (pwa.checking && !working && !processingFiles && !navigating)) && (
        <div className="update-overlay" role="status" aria-live="polite">
          <div className="update-overlay-visual" aria-hidden="true">
            <span className="update-overlay-spinner" />
            <span className="update-overlay-mark"><Sparkles size={26} strokeWidth={1.8} /></span>
          </div>
          <strong>{t(pwa.applying ? "Installing update…" : "Checking for updates…")}</strong>
          {pwa.applying && <span className="update-overlay-detail">{t("Saving your work and restarting Luma Chat…")}</span>}
        </div>
      )}
      <Sidebar
        locale={locale}
        open={mobileDrawer}
        desktop={desktop}
        collapsed={settings.sidebarCollapsed}
        width={settings.sidebarWidth}
        active={active}
        chatView={view === "chat"}
        chats={threads}
        projects={settings.projects}
        working={working || processingFiles || navigating}
        onClose={closeDrawer}
        onCreate={create}
        onChoose={choose}
        onNotice={setNotice}
        onSearch={setSearchMode}
        onSettings={openSettings}
        onWidthChange={(width) => void saveSettings({ sidebarWidth: width })}
        onChat={organizeChat}
        onDeleteChat={remove}
        onSaveProject={saveProject}
        onDeleteProject={deleteProject}
      />
      <button
        className="scrim"
        data-open={mobileDrawer}
        tabIndex={-1}
        aria-hidden="true"
        onClick={closeDrawer}
      />
      <main className="main" inert={mobileDrawer || undefined}>
        <Topbar workspace={workspace} />
        {conflicts.size > 0 && (
          <aside
            className="conflict-notice"
            aria-label={t("Conversation conflicts")}
          >
            <p role="status">
              {t(
                "Another tab changed or deleted this conversation. Save this tab’s version as a separate chat to keep its messages, draft and files.",
              )}
            </p>
            {threads
              .filter(({ id }) => conflicts.has(id))
              .map((c) => (
                <div
                  className="button-row"
                  key={c.id}
                  role="group"
                  aria-label={c.title}
                >
                  <strong>
                    {c.title === "New chat" ? t("New chat") : c.title}
                  </strong>
                  <button
                    type="button"
                    className="secondary"
                    disabled={working || navigating || processingFiles}
                    onClick={() => void keepConflictCopy(c.id)}
                  >
                    {t("Save a separate copy")}
                  </button>
                </div>
              ))}
          </aside>
        )}
        {view === "chat" && (
          <>
            {virtualExperiment && <div className="virtual-notice"><span role="status">{t(virtualEnabled ? "Experimental long conversation mode is active. Use full mode for screen readers or browser Find." : interactionHold ? "Full conversation is shown while you interact or select text." : "Full conversation is shown during search, editing or for short chats.")}</span>{interactionHold && <button type="button" onClick={() => setInteractionChat(null)}>{t("Resume virtual mode (closes open previews)")}</button>}<button type="button" onClick={() => void copyConversation()}>{t("Copy conversation")}</button><button type="button" onClick={() => { setInteractionChat(null); setVirtualExperiment(false); }}>{t("Show full conversation")}</button></div>}
            <section
              className={`conversation${!visibleMessages.length ? " conversation-empty" : ""}`}
              data-conversation-id={active}
              aria-label={t("Conversation")}
              tabIndex={-1}
              ref={conversation}
              onScroll={onMessageScroll}
              onWheelCapture={markScrollIntent}
              onTouchStartCapture={markScrollIntent}
              onPointerDownCapture={(event) => { if (event.pointerType !== "mouse" || event.target === event.currentTarget) markScrollIntent(); }}
              onPointerMoveCapture={(event) => { if (event.buttons) markScrollIntent(); }}
              onKeyDownCapture={(event) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) markScrollIntent(); }}
            >
              {!chat || visibleMessages.length === 0 ? (
                <div className="welcome">
                  <div className="welcome-icon">
                    <Sparkles size={28} />
                  </div>
                  <h1>{t("How can I help you today?")}</h1>
                  <p>
                    {t(
                      "Your conversations stay on this device. Choose a provider and model to get started.",
                    )}
                  </p>
                  <button className="secondary" onClick={openSettings}>
                    {t("Configure a provider")}
                  </button>
                  {!chat && (
                    <button className="primary" onClick={create}>
                      {t("Start a new chat")}
                    </button>
                  )}
                </div>
              ) : (
                <MessageList workspace={workspace} chat={chat} versions={messageVersions} onAction={setMessageAction} onSwitchVersion={switchMessageVersion} virtualEnabled={virtualEnabled} virtualRequested={virtualExperiment} onFullMode={() => setInteractionChat(active)} />
              )}
              {showJumpToLatest && visibleMessages.length > 0 && <div className="conversation-jump"><button type="button" onClick={jumpToLatest}><ArrowDown size={16} aria-hidden="true" />{t("Jump to latest")}</button></div>}
            </section>
            <Composer
              locale={locale}
              enabled={Boolean(chat) && !navigating}
              enterSends={desktopInput}
              draft={displayedDraft?.draft || ""}
              files={displayedDraft?.draftAttachments || []}
              processingFiles={processingFiles}
              phase={phase}
              blockedReason={chat ? composerBlocked : undefined}
              compatibilityHint={
                chat && javascriptEnabled && requiresLunaToolCompatibility(config)
                  ? "GPT-6 Luna uses reasoning effort none when local tools are enabled. Turn tools off or use Responses API to apply the selected effort."
                  : undefined
              }
              editing={Boolean(chat?.editState)}
              editingCanCancel={!working && !navigating && !processingFiles && !replySave && !conflicts.has(active)}
              onCancelEdit={() => void cancelEdit()}
              notice={workspace.notice}
              onDismissNotice={() => setNotice("")}
              commandsEnabled={Boolean(chat) && !working && !navigating && !processingFiles && !conflicts.has(active) && !replySave}
              onCommand={runCommand}
              modelControl={
                <>
                  <button
                    className="icon composer-reasoning"
                    type="button"
                    aria-label={t("Local tools")}
                    aria-describedby={toolsHelpId}
                    aria-pressed={javascriptEnabled}
                    disabled={!chat || working}
                    title={t(
                      "Enable local JavaScript, time, calculation, file, text and memory tools. Results are sent to the selected model.",
                    )}
                    onClick={toggleJavaScript}
                  >
                    <Code2 size={18} aria-hidden="true" />
                    <span>{t("Tools")}</span>
                  </button>
                  <span className="visually-hidden" id={toolsHelpId}>
                    {t("Enable local JavaScript, time, calculation, file, text and memory tools. Results are sent to the selected model.")}
                  </span>
                  {reasoningAvailable && (
                    <button
                      className="icon composer-reasoning composer-thoughts"
                      type="button"
                      title={reasoningLabel}
                      aria-label={reasoningLabel}
                      aria-pressed={config.requestThoughts === true}
                      onClick={() => setReasoning(!config.requestThoughts)}
                    >
                      <Brain size={18} aria-hidden="true" />
                      <span>{t("Reasoning")}</span>
                    </button>
                  )}
                  <ModelSelector
                    triggerRef={modelTrigger}
                    locale={locale}
                    autoFocusSearch={desktopInput}
                    provider={config.id}
                    modelId={config.model}
                    selected={selectedModel}
                    groups={modelGroups}
                    onLoad={loadCatalog}
                    onSelect={selectModel}
                    onSettings={openSettings}
                  />
                  <span className="composer-effort-wrap">
                    <select
                      className="composer-effort"
                      aria-label={t("Reasoning effort")}
                      title={t("Reasoning effort")}
                      value={effortFor(config.id, config.reasoningEffort)}
                      disabled={!chat || !config.model.trim() || working || navigating || processingFiles}
                      onChange={(event) => setModelEffort(event.target.value)}
                    >
                      {effortOptions(config.id).map((effort) => <option key={effort} value={effort}>{t(effort === "default" ? "Model default" : effort)}</option>)}
                    </select>
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </>
              }
              onDraft={editDraft}
              onFiles={processFiles}
              onRemove={removeDraftFile}
              onSend={() => void send()}
              onStop={stopReply}
            />
          </>
        )}
        {showingSettings && <SettingsView workspace={workspace} virtualExperiment={virtualExperiment} onVirtualExperiment={setVirtualExperiment} />}
      </main>
      {messageAction && messageAction.chatId === chat?.id && (
        <MessageActionDialog locale={locale} kind={messageAction.kind} current={effective.config} original={messageAction.message.request} branchCount={branchDescendants(chat, messageAction.message.id).size} onClose={() => closeMessageAction(true)} onConfirm={(original) => {
          const action = messageAction;
          closeMessageAction(false);
          if (action.kind === "retry") void retry(original, action.message.id);
          else if (action.kind === "delete") void changeBranch(action.message.id, true);
          else void editMessage(action.message);
        }} />
      )}
      {historyTarget && (
        <HistorySharingDialog
          locale={locale}
          provider={historyTarget}
          onChoose={finishHistoryChoice}
        />
      )}
      {inspecting && (
        <WorkspaceInspector
          locale={locale}
          chat={chat}
          effective={effective}
          reply={activeReply}
          preferences={settings}
          processingFiles={processingFiles}
          online={online}
          credentialState={credentialState}
          effectiveTheme={effectiveTheme}
          originStorage={originStorage}
          conversationCount={threads.length}
          getBufferedDrafts={getBufferedDrafts}
          pwa={pwa}
          redact={redact}
          onClose={() => setInspecting(false)}
        />
      )}
      {searchMode && (
        <WorkspaceSearch
          locale={locale}
          initialMode={searchMode}
          chats={threads}
          projects={settings.projects}
          onClose={() => setSearchMode(null)}
          onChoose={openSearchResult}
          restoreDisabled={working || processingFiles || navigating}
          onRestore={(chatId) => organizeChat(chatId, { archived: false })}
        />
      )}
    </div>
  );
}
export default App;
