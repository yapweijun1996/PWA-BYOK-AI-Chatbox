import { ArrowLeft, Download, Upload, Sparkles, Trash2 } from "lucide-react";
import { effortFor, effortOptions } from "../reasoning-effort";
import { downloadBackup } from "../backup";
import { formatSize } from "../format-size";
import { interpolate, translateNotice } from "../i18n";
import { canRequestReasoning } from "../model-options";
import { labels, providerIds as providers } from "../types";
import { settingsSections } from "../settings-sections";
import type { useWorkspace } from "../use-workspace";
import { LmStudioAddressEditor } from "./LmStudioAddressEditor";
import { MemorySettings } from "./MemorySettings";
import { PreferenceFields } from "./Preferences";

type SettingsWorkspace = Pick<ReturnType<typeof useWorkspace>, "locale" | "t" | "threads" | "view" | "working" | "processingFiles" | "navigating" | "clearing" | "settings" | "settingsHeading" | "importInput" | "saveSettings" | "remove" | "chat" | "config" | "selectModel" | "setView" | "reasoningLabel" | "setReasoning" | "browseProvider" | "toggleConversationConfig" | "updateConfig" | "models" | "showKey" | "keyInput" | "setKeyInput" | "setShowKey" | "saveKey" | "setSaveKey" | "storeKey" | "deleteKey" | "hasSessionCredential" | "hasVault" | "hasLegacyVault" | "testConnection" | "usage" | "requestPersistence" | "exportData" | "exportPlan" | "importFile" | "importPreferences" | "setImportPreferences" | "importPreview" | "importDestination" | "finishImport" | "discardImport" | "clearData" | "preferences">;
export function SettingsView({ workspace }: { workspace: SettingsWorkspace }) {
  const { locale, t, threads, view, working, processingFiles, navigating, clearing, settings, settingsHeading, importInput, saveSettings, remove, chat, config, selectModel, setView, reasoningLabel, setReasoning, browseProvider, toggleConversationConfig, updateConfig, models, showKey, keyInput, setKeyInput, setShowKey, saveKey, setSaveKey, storeKey, deleteKey, hasSessionCredential, hasVault, hasLegacyVault, testConnection, usage, requestPersistence, exportData, exportPlan, importFile, importPreferences, setImportPreferences, importPreview, importDestination, finishImport, discardImport, clearData, preferences } = workspace;
  return (
          <section
            className="page settings-page"
            aria-labelledby="settings-title"
            aria-busy={clearing || undefined}
            inert={clearing || undefined}
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
                      className={`tab ${config.id === p ? "active" : ""}`}
                      aria-pressed={config.id === p}
                      onClick={() => browseProvider(p)}
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
                  {config.id === "anthropic" && (
                    <p className="hint">{t("Anthropic requests use your API key directly in this browser. Use only on a trusted device and network. Your API usage may incur charges.")}</p>
                  )}
                  <div className="button-row">
                    <button
                      className="secondary"
                      type="button"
                      disabled={settings.provider === config.id}
                      onClick={() => void saveSettings({ provider: config.id })}
                    >
                      {t(
                        settings.provider === config.id
                          ? "Default provider"
                          : "Set as default provider",
                      )}
                    </button>
                    {chat && (
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
                    )}
                  </div>
                  {config.id === "lmstudio" && (
                    <>
                      <LmStudioAddressEditor
                        locale={locale}
                        endpoint={config.endpoint}
                        onApply={(endpoint) =>
                          updateConfig({ endpoint, vision: false })
                        }
                      />
                      <p className="hint">
                        {t(
                          "Enable CORS in LM Studio. On a phone, use the computer’s network address; localhost refers to the phone. Browser local-network permission, HTTPS restrictions and firewall settings can affect access. Enable authentication when exposing the server.",
                        )}
                      </p>
                    </>
                  )}
                  {config.id === "openai" && <>
                    <label className="field">
                      {t("OpenAI API mode")}
                      <select value={config.openaiApi ?? "chat_completions"} onChange={(e) => void updateConfig({ openaiApi: e.target.value === "responses" ? "responses" : "chat_completions" })}>
                        <option value="chat_completions">Chat Completions</option>
                        <option value="responses">Responses API</option>
                      </select>
                    </label>
                    <p className="hint">{t("Responses API is experimental and has been tested with a mock interface. Tool history is stored on this device and sent with the active branch.")}</p>
                  </>}
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
                  <label className="field">
                    {t("Reasoning effort")}
                    <select disabled={!config.model.trim()} value={effortFor(config.id, config.reasoningEfforts?.[config.model])} onChange={(e) => {
                      const effort = effortFor(config.id, e.target.value);
                      void updateConfig({ reasoningEfforts: { ...config.reasoningEfforts, [config.model]: effort }, reasoningEffort: effort });
                    }}>
                      {effortOptions(config.id).map((effort) => <option key={effort} value={effort}>{t(effort === "default" ? "Model default" : effort)}</option>)}
                    </select>
                  </label>
                  <p className="hint">{t("Saved per provider and model. Only choose a level supported by the model; unsupported settings may be rejected. Existing conversation overrides keep their saved settings.")}</p>
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
                      "Keys are accessible to this app. Device storage does not protect against malicious scripts or a compromised device. Your provider receives your messages.",
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
                        placeholder={t("Enter API key or token")}
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
                  <p className="hint">{t("Saved keys are available automatically on this device. Anyone with access to this browser profile or malicious scripts may be able to use them.")}</p>
                  {hasLegacyVault && <p className="hint">{t("A key was saved with the old password system. Enter the API key again to replace it with password-free storage, or delete the old saved key.")}</p>}
                  <div className="button-row">
                    <button className="primary" onClick={() => void storeKey()}>
                      {t("Use key")}
                    </button>
                    {hasVault && (
                      <>
                        <button
                          className="secondary"
                          onClick={() => void deleteKey()}
                        >
                          {t("Delete saved key")}
                        </button>
                      </>
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
                        ? t(hasLegacyVault ? "A legacy key requires replacement." : "Restoring saved key…")
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
                <MemorySettings locale={locale} disabled={clearing || working || navigating || processingFiles} />
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
                        disabled={working || navigating || processingFiles}
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
                    {exportPlan && (
                      <div aria-live="polite">
                        <p>
                          {t(
                            "The workspace does not fit in one 100 MiB backup.",
                          )}
                        </p>
                        {exportPlan.groups.length > 0 && (
                          <>
                            <p>
                              {t(
                                "Download each group and import the files one at a time. Each file includes projects and preferences.",
                              )}
                            </p>
                            <div className="button-row">
                              {exportPlan.groups.map(
                                ({ blob, count }, index) => (
                                  <button
                                    key={index}
                                    className="secondary"
                                    onClick={() =>
                                      downloadBackup(
                                        blob,
                                        `luma-chat-backup-${index + 1}-of-${exportPlan.groups.length}.json`,
                                      )
                                    }
                                  >
                                    {t("Download group")} {index + 1}/
                                    {exportPlan.groups.length} · {count}{" "}
                                    {t("conversations")} ·{" "}
                                    {formatSize(blob.size)}
                                  </button>
                                ),
                              )}
                            </div>
                          </>
                        )}
                        {exportPlan.tooLarge.length > 0 && (
                          <>
                            <p>
                              {t(
                                "Not backed up: each conversation below exceeds the limit on its own. Its local data has not been changed.",
                              )}
                            </p>
                            <ul>
                              {exportPlan.tooLarge.map((title, i) => (
                                <li key={i}>{title}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
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
                    {importDestination && (
                      <p>
                        {t(
                          "Importing preferences will change the LM Studio server:",
                        )}{" "}
                        <code>{importDestination}</code>
                      </p>
                    )}
                    <p>
                      {importPreview.conversations.length}
                      {t(" conversations;")} {importPreview.existing.size}{" "}
                      {t("have an existing ID. Backups do not contain keys.")}
                    </p>
                    {importPreview.settings && (
                      <p>
                        <label>
                          <input
                            type="checkbox"
                            checked={importPreferences}
                            disabled={navigating}
                            onChange={(event) =>
                              setImportPreferences(event.target.checked)
                            }
                          />{" "}
                          {t("Also import appearance and provider settings")}
                        </label>
                      </p>
                    )}
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={working || navigating || processingFiles}
                        onClick={() => void finishImport(false)}
                      >
                        {t("Import and skip conflicts")}
                      </button>
                      <button
                        className="secondary"
                        disabled={working || navigating || processingFiles}
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
                      <button
                        className="secondary"
                        disabled={navigating}
                        onClick={discardImport}
                      >
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
                      disabled={working || processingFiles || navigating}
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
  );
}
