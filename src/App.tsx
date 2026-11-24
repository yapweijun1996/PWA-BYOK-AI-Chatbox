import { useState } from "react";
import {
  Menu,
  Paperclip,
  Sparkles,
  ArrowLeft,
  Trash2,
  Download,
  Upload,
  Copy,
  ChevronDown,
  RefreshCw,
  Brain,
  Search,
  Settings as SettingsIcon,
  SquarePen,
  ScanLine,
} from "lucide-react";
import { version } from "../package.json";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceSearch } from "./components/WorkspaceSearch";
import { WorkspaceInspector } from "./components/WorkspaceInspector";
import { Composer } from "./components/Composer";
import { ModelSelector } from "./components/ModelSelector";
import { canRequestReasoning, compactModelName } from "./model-options";
import { formatSize } from "./format-size";
import { PreferenceFields } from "./components/Preferences";
import { Toast } from "./components/Toast";
import { ResponseInspector } from "./components/ResponseInspector";
import { RichMessage } from "./components/RichMessage";
import { copyMessage } from "./message-copy";
import { interpolate, translate, translateNotice } from "./i18n";
import type { Locale } from "./i18n";
import type { InitialAppState } from "./startup";
import { labels, providerIds as providers } from "./types";
import { useWorkspace, settingsSections } from "./use-workspace";
import "./generated/tokens-light.css";
import "./generated/tokens-dark.css";
import "./styles.css";
import "./workspace.css";

function Reasoning({
  text,
  streaming,
  locale,
  onNotice,
}: {
  text: string;
  streaming: boolean;
  locale: Locale;
  onNotice: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const t = (text: string) => translate(locale, text);
  return (
    <details
      className="reasoning"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{streaming ? t("Thinking…") : t("Reasoning")}</summary>
      <RichMessage
        text={text}
        streaming={streaming}
        locale={locale}
        onNotice={onNotice}
      />
    </details>
  );
}
function App({
  initial,
  onInitialCommit,
}: {
  initial: InitialAppState;
  onInitialCommit: () => void;
}) {
  const {
    locale,
    t,
    threads,
    active,
    view,
    working,
    processingFiles,
    desktop,
    mobileDrawer,
    settings,
    searchMode,
    setSearchMode,
    drawerToggle,
    settingsHeading,
    importInput,
    messagesContent,
    conversation,
    closeDrawer,
    create,
    choose,
    openSettings,
    saveSettings,
    organizeChat,
    remove,
    saveProject,
    deleteProject,
    toggleSidebar,
    setDrawer,
    chat,
    config,
    selectedModel,
    isConfigured,
    checking,
    updateLabel,
    check,
    inspecting,
    setInspecting,
    notice,
    setNotice,
    onMessageScroll,
    retry,
    desktopInput,
    displayedDraft,
    phase,
    composerBlocked,
    modelGroups,
    loadCatalog,
    selectModel,
    setView,
    reasoningAvailable,
    reasoningLabel,
    setReasoning,
    editDraft,
    processFiles,
    removeDraftFile,
    send,
    stopReply,
    showingSettings,
    setProvider,
    toggleConversationConfig,
    updateConfig,
    models,
    showKey,
    keyInput,
    setKeyInput,
    setShowKey,
    saveKey,
    setSaveKey,
    password,
    setPassword,
    storeKey,
    unlock,
    deleteKey,
    hasSessionCredential,
    hasVault,
    lockKey,
    testConnection,
    usage,
    requestPersistence,
    exportData,
    importFile,
    importPreview,
    finishImport,
    discardImport,
    clearData,
    preferences,
    effective,
    activeReply,
    online,
    credentialState,
    effectiveTheme,
    originStorage,
    getBufferedDrafts,
    pwa,
    redact,
  } = useWorkspace({ initial, onInitialCommit });
  return (
    <div className="app">
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
        working={working || processingFiles}
        onClose={closeDrawer}
        onCreate={create}
        onChoose={choose}
        onSearch={setSearchMode}
        onSettings={openSettings}
        onWidthChange={(width) => void saveSettings({ sidebarWidth: width })}
        onChat={organizeChat}
        onDeleteChat={(chatId) => void remove(chatId)}
        onSaveProject={(name, projectId, chatId) =>
          void saveProject(name, projectId, chatId)
        }
        onDeleteProject={deleteProject}
      />
      {mobileDrawer && (
        <button
          className="scrim"
          tabIndex={-1}
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}
      <main className="main" inert={mobileDrawer || undefined}>
        <header className="topbar">
          <button
            className="icon desktop-toggle"
            aria-label={
              settings.sidebarCollapsed
                ? t("Expand sidebar")
                : t("Collapse sidebar")
            }
            aria-expanded={!settings.sidebarCollapsed}
            aria-controls="chat-sidebar"
            onClick={toggleSidebar}
          >
            <Menu size={22} />
          </button>
          <button
            className="icon mobile"
            ref={drawerToggle}
            aria-label={t("Open menu")}
            aria-expanded={mobileDrawer}
            aria-controls="chat-sidebar"
            onClick={() => setDrawer(true)}
          >
            <Menu size={22} />
          </button>
          <strong>
            {view === "chat"
              ? !chat || chat.title === "New chat"
                ? t("New chat")
                : chat.title
              : t("Settings")}
          </strong>
          <div className="top-actions">
            {view === "chat" && (
              <button
                className="model-pill"
                title={config.model || undefined}
                onClick={() => setView("providers")}
              >
                <Sparkles size={17} />
                <span>
                  {labels[config.id]} ·{" "}
                  {selectedModel
                    ? compactModelName(selectedModel)
                    : t("Choose a model")}
                </span>
                <ChevronDown size={16} />
              </button>
            )}
            {view === "chat" && (
              <span className="connection-state">
                {isConfigured ? t("Ready to send") : t("Setup needed")}
              </span>
            )}
            <span className="local-pill">
              <span className="dot" />
              {t(" Local storage")}
            </span>
            {desktop && settings.sidebarCollapsed && (
              <>
                <button
                  className="icon workspace-shortcut"
                  aria-label={t("New chat")}
                  title={t("New chat")}
                  onClick={create}
                >
                  <SquarePen size={18} aria-hidden="true" />
                </button>
                <button
                  className="icon workspace-shortcut"
                  aria-label={t("Search conversations")}
                  title={t("Search conversations")}
                  aria-haspopup="dialog"
                  onClick={() => setSearchMode("active")}
                >
                  <Search size={18} aria-hidden="true" />
                </button>
                <button
                  className="icon workspace-shortcut"
                  aria-label={t("Settings")}
                  title={t("Settings")}
                  onClick={openSettings}
                >
                  <SettingsIcon size={18} aria-hidden="true" />
                </button>
              </>
            )}
            <button
              className="icon inspector-control"
              type="button"
              aria-label={t("Workspace Inspector")}
              title={t("Workspace Inspector")}
              aria-haspopup="dialog"
              onClick={() => setInspecting(true)}
            >
              <ScanLine size={18} aria-hidden="true" />
            </button>
            <button
              className="icon update-control"
              type="button"
              aria-label={updateLabel}
              title={updateLabel}
              aria-busy={checking}
              aria-disabled={checking}
              onClick={() => void check()}
            >
              <RefreshCw size={18} aria-hidden="true" />
              <span aria-hidden="true">v{version}</span>
            </button>
          </div>
          <Toast
            locale={locale}
            message={notice}
            onDismiss={() => setNotice("")}
          />
        </header>
        {view === "chat" && (
          <>
            <section
              className="conversation"
              data-conversation-id={active}
              aria-label={t("Conversation")}
              ref={conversation}
              onScroll={onMessageScroll}
            >
              {!chat || chat.messages.length === 0 ? (
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
                  <button
                    className="secondary"
                    onClick={() => setView("providers")}
                  >
                    {t("Configure a provider")}
                  </button>
                  {!chat && (
                    <button className="primary" onClick={create}>
                      {t("Start a new chat")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="messages" ref={messagesContent}>
                  {chat.messages.map((m) => (
                    <article
                      className={`message ${m.role}`}
                      key={m.id}
                      data-message-id={m.id}
                    >
                      <div className="avatar">
                        {m.role === "user" ? t("U") : <Sparkles size={19} />}
                      </div>
                      <div className="bubble">
                        <div className="message-meta">
                          <strong>
                            {m.role === "assistant" ? t("Luma Chat") : t("You")}
                          </strong>
                          <time>
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
                            onNotice={setNotice}
                          />
                        )}
                        {m.content ? (
                          <div className="message-answer">
                            <RichMessage
                              text={m.content}
                              locale={locale}
                              streaming={m.status === "streaming"}
                              onNotice={setNotice}
                            />
                          </div>
                        ) : m.status === "streaming" && !m.reasoning ? (
                          <p className="muted">{t("Thinking…")}</p>
                        ) : null}
                        {m.attachments?.map((a) => (
                          <div className="attachment-label" key={a.id}>
                            <Paperclip size={14} />
                            {a.name} · {formatSize(a.size)}
                          </div>
                        ))}
                        {m.status === "interrupted" && (
                          <div className="status-label">
                            {t("Stopped or interrupted")}
                          </div>
                        )}
                        {m.status === "error" && (
                          <div className="status-label">
                            {t("Response failed")}
                          </div>
                        )}
                        {(m.status === "error" || m.status === "interrupted") &&
                          m.id ===
                            chat.messages[chat.messages.length - 1]?.id && (
                            <div className="button-row">
                              <button
                                className="secondary retry"
                                disabled={working}
                                onClick={() => void retry()}
                              >
                                {t("Retry")}
                              </button>
                              {m.request && (
                                <button
                                  className="secondary retry"
                                  disabled={working}
                                  onClick={() => void retry(m.request)}
                                >
                                  {t("Retry with original model")}
                                </button>
                              )}
                            </div>
                          )}
                        {m.content && (
                          <button
                            className="copy"
                            onClick={() => void copyMessage(m, setNotice)}
                          >
                            <Copy size={14} />
                            {t(" Copy")}
                          </button>
                        )}
                        {m.role === "assistant" && (
                          <ResponseInspector message={m} locale={locale} />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <Composer
              locale={locale}
              enabled={Boolean(chat)}
              enterSends={desktopInput}
              draft={displayedDraft?.draft || ""}
              files={displayedDraft?.draftAttachments || []}
              processingFiles={processingFiles}
              phase={phase}
              blockedReason={chat ? composerBlocked : undefined}
              modelControl={
                <>
                  <ModelSelector
                    locale={locale}
                    autoFocusSearch={desktopInput}
                    provider={config.id}
                    selected={selectedModel}
                    groups={modelGroups}
                    onLoad={loadCatalog}
                    onSelect={selectModel}
                    onSettings={() => setView("providers")}
                  />
                  {reasoningAvailable && (
                    <button
                      className="icon composer-reasoning"
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
        {showingSettings && (
          <section
            className="page settings-page"
            aria-labelledby="settings-title"
          >
            <button className="back" onClick={() => setView("chat")}>
              <ArrowLeft size={16} aria-hidden="true" />
              {t(" Back to chat")}
            </button>
            <h1 id="settings-title" tabIndex={-1} ref={settingsHeading}>
              {t("Settings")}
            </h1>
            <nav className="settings-nav" aria-label={t("Settings sections")}>
              {settingsSections.map(([section, label]) => (
                <button
                  type="button"
                  className="tab"
                  aria-current={view === section ? "page" : undefined}
                  key={section}
                  onClick={() => setView(section)}
                >
                  {t(label)}
                </button>
              ))}
            </nav>
            {view === "providers" && (
              <section
                className="settings-section"
                aria-labelledby="providers-title"
              >
                <h2 id="providers-title">{t("AI providers")}</h2>
                <p className="subtitle">
                  {t(
                    "Connect your own model. Requests go directly from this browser to the selected provider.",
                  )}
                </p>
                <div className="provider-tabs">
                  {providers.map((p) => (
                    <button
                      key={p}
                      className={`tab ${settings.provider === p ? "active" : ""}`}
                      onClick={() => setProvider(p)}
                    >
                      {labels[p]}
                    </button>
                  ))}
                </div>
                <div className="card">
                  <div className="card-heading">
                    <div className="provider-icon">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h2>{labels[config.id]}</h2>
                      <p>
                        {config.id === "lmstudio"
                          ? t("Connect to a local or trusted network server.")
                          : config.id === "openrouter"
                            ? t(
                                "Use an OpenRouter key to access its model catalog.",
                              )
                            : t("Use your own API key and choose a model.")}
                      </p>
                    </div>
                  </div>
                  {chat && (
                    <div className="button-row">
                      <button
                        className="secondary"
                        type="button"
                        onClick={toggleConversationConfig}
                      >
                        {t(
                          chat.configOverride
                            ? "Use global model settings"
                            : "Use this model for the current chat",
                        )}
                      </button>
                    </div>
                  )}
                  {config.id === "lmstudio" && (
                    <>
                      <label className="field">
                        {t("Server base URL")}
                        <input
                          value={config.endpoint}
                          onChange={(e) =>
                            updateConfig({
                              endpoint: e.target.value,
                              vision: false,
                            })
                          }
                          placeholder="http://localhost:1234/v1"
                        />
                      </label>
                      <p className="hint">
                        {t(
                          "Enable CORS in LM Studio. On a phone, use the computer’s network address; localhost refers to the phone. Browser local-network permission, HTTPS restrictions and firewall settings can affect access. Enable authentication when exposing the server.",
                        )}
                      </p>
                    </>
                  )}
                  <label className="field">
                    {t("Model ID")}
                    <input
                      list="model-list"
                      value={config.model}
                      onChange={(e) => {
                        const id = e.target.value;
                        selectModel(
                          config.id,
                          models.find((option) => option.id === id) || { id },
                        );
                      }}
                      placeholder={t("Enter a model ID or test connection")}
                    />
                  </label>
                  <datalist id="model-list">
                    {models.map(({ id }) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={config.vision}
                      onChange={(e) =>
                        updateConfig({ vision: e.target.checked })
                      }
                    />{" "}
                    {t("This model supports image input")}
                  </label>
                  <p className="hint">
                    {t(
                      "Enable only when your selected model supports images. Plain text attachments are sent as text.",
                    )}
                  </p>
                  {canRequestReasoning(config.id) && (
                    <>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={config.requestThoughts === true}
                          disabled={!config.model.trim()}
                          onChange={(e) => setReasoning(e.target.checked)}
                        />{" "}
                        {reasoningLabel}
                      </label>
                      <p className="hint">
                        {config.id === "gemini"
                          ? t(
                              "Enable for models that support thought summaries. Some requests or models return no summary.",
                            )
                          : t(
                              "Enable for supported models. Reasoning may affect cost, and some models do not expose it.",
                            )}
                      </p>
                    </>
                  )}
                  <div className="divider" />
                  <h3>
                    {config.id === "lmstudio"
                      ? t("API token (optional)")
                      : t("API key")}
                  </h3>
                  <p className="hint">
                    {t(
                      "Keys are accessible to this app while unlocked. Encrypted storage does not protect against malicious scripts or a compromised device. Your provider receives your messages.",
                    )}
                  </p>
                  <label className="field">
                    {config.id === "lmstudio" ? t("Token") : t("Key")}
                    <div className="password-row">
                      <input
                        type={showKey ? "text" : "password"}
                        autoComplete="off"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder={t("Enter key for this session")}
                      />
                      <button
                        className="secondary"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? t("Hide") : t("Show")}
                      </button>
                    </div>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={saveKey}
                      onChange={(e) => setSaveKey(e.target.checked)}
                    />{" "}
                    {t("Save encrypted on this device")}
                  </label>
                  {(saveKey || hasVault) && (
                    <label className="field">
                      {t("Unlock password")}
                      <input
                        type="password"
                        autoComplete="off"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("Enter your password")}
                      />
                    </label>
                  )}
                  <p className="hint">
                    {t(
                      "If you forget the password, the saved key cannot be recovered. Session keys are cleared on reload.",
                    )}
                  </p>
                  <div className="button-row">
                    <button className="primary" onClick={() => void storeKey()}>
                      {t("Use key")}
                    </button>
                    {hasVault && (
                      <>
                        <button
                          className="secondary"
                          onClick={() => void unlock()}
                        >
                          {t("Unlock saved key")}
                        </button>
                        <button
                          className="secondary"
                          onClick={() => void deleteKey()}
                        >
                          {t("Delete saved key")}
                        </button>
                      </>
                    )}
                    {hasSessionCredential && (
                      <button className="secondary" onClick={lockKey}>
                        {t("Lock")}
                      </button>
                    )}
                    <button
                      className="secondary"
                      onClick={() => void testConnection()}
                    >
                      {t("Test connection")}
                    </button>
                  </div>
                  <p className="hint">
                    {hasSessionCredential
                      ? t("A key or token is available for this session.")
                      : hasVault
                        ? t("A saved key is locked.")
                        : t("No key is saved.")}{" "}
                    {t(
                      "Testing requests the model list and may use network resources. A model list does not confirm the key or chat access.",
                    )}
                  </p>
                </div>
                <div className="info">
                  {t(
                    "Cloud providers may reject direct browser requests. This app does not include a proxy or server-side key store.",
                  )}
                </div>
              </section>
            )}
            {view === "data" && (
              <section
                className="settings-section"
                aria-labelledby="local-data-title"
              >
                <h2 id="local-data-title">{t("Local data")}</h2>
                <p className="subtitle">
                  {t("Manage your chats, attachments, and browser storage.")}
                </p>
                <div className="data-grid">
                  <div className="card">
                    <h2>{t("Local storage")}</h2>
                    <p>{translateNotice(locale, usage)}</p>
                    <div className="stat-row">
                      <div>
                        <strong>{threads.length}</strong>
                        <span>{t("Conversations")}</span>
                      </div>
                      <div>
                        <strong>
                          {threads.reduce(
                            (n, c) =>
                              n +
                              (c.draftAttachments?.length || 0) +
                              c.messages.reduce(
                                (s, m) => s + (m.attachments?.length || 0),
                                0,
                              ),
                            0,
                          )}
                        </strong>
                        <span>{t("Attachments")}</span>
                      </div>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => void requestPersistence()}
                    >
                      {t("Request persistent storage")}
                    </button>
                  </div>
                  <div className="card">
                    <h2>{t("Backup")}</h2>
                    <p>
                      {t(
                        "Export conversations, attachments, and settings. API keys are excluded.",
                      )}
                    </p>
                    <div className="button-row">
                      <button className="primary" onClick={exportData}>
                        <Download size={16} />
                        {t(" Export backup")}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => importInput.current?.click()}
                        disabled={working}
                      >
                        <Upload size={16} />
                        {t(" Import backup")}
                      </button>
                      <input
                        type="file"
                        accept="application/json,.json"
                        hidden
                        ref={importInput}
                        onChange={(e) => void importFile(e.target.files?.[0])}
                      />
                    </div>
                  </div>
                </div>
                <div className="info">
                  {t(
                    "Browser storage can be cleared or evicted. Keep a backup of conversations you need. Data does not automatically sync between devices.",
                  )}
                </div>
                {importPreview && (
                  <div className="card">
                    <h2>{t("Import preview")}</h2>
                    <p>
                      {importPreview.conversations.length}
                      {t(" conversations;")}{" "}
                      {
                        importPreview.conversations.filter((c) =>
                          threads.some((t) => t.id === c.id),
                        ).length
                      }{" "}
                      {t("have an existing ID. Backups do not contain keys.")}
                    </p>
                    <div className="button-row">
                      <button
                        className="primary"
                        onClick={() => void finishImport(false)}
                      >
                        {t("Import and skip conflicts")}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          if (
                            confirm(
                              t(
                                "Replace existing conversations with matching IDs?",
                              ),
                            )
                          )
                            void finishImport(true);
                        }}
                      >
                        {t("Replace conflicts")}
                      </button>
                      <button className="secondary" onClick={discardImport}>
                        {t("Cancel")}
                      </button>
                    </div>
                  </div>
                )}
                <div className="card">
                  <div className="section-head">
                    <h2>{t("Conversations")}</h2>
                    <button
                      className="danger"
                      onClick={() => void clearData()}
                      disabled={working}
                    >
                      <Trash2 size={16} />
                      {t(" Clear all local data")}
                    </button>
                  </div>
                  {threads.length === 0 ? (
                    <p className="muted">{t("No conversations yet.")}</p>
                  ) : (
                    <div className="data-list">
                      {threads.map((c) => (
                        <div className="data-item" key={c.id}>
                          <div>
                            <strong>{c.title}</strong>
                            <small>
                              {c.messages.length}
                              {t(" messages ·")}{" "}
                              {new Date(c.updatedAt).toLocaleDateString(locale)}
                            </small>
                          </div>
                          <button
                            className="icon"
                            aria-label={interpolate(
                              t("Delete {name}"),
                              c.title === "New chat" ? t("New chat") : c.title,
                            )}
                            disabled={working}
                            onClick={() => void remove(c.id)}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
            {view === "appearance" && (
              <section
                className="settings-section"
                aria-labelledby="appearance-title"
              >
                <h2 id="appearance-title">{t("Appearance")}</h2>
                <p className="subtitle">
                  {t("Choose how Luma Chat looks on this device.")}
                </p>
                <div className="card">
                  <PreferenceFields {...preferences} fieldClassName="field" />
                </div>
              </section>
            )}
          </section>
        )}
      </main>
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
          onChoose={choose}
          onRestore={(chatId) => organizeChat(chatId, { archived: false })}
        />
      )}
    </div>
  );
}
export default App;
