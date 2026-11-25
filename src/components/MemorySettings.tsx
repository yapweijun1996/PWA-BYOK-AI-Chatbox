import { useCallback, useEffect, useState } from "react";
import { storage } from "../storage";
import { translate } from "../i18n";
import type { Locale } from "../i18n";

export function MemorySettings({
  locale,
  disabled,
}: {
  locale: Locale;
  disabled: boolean;
}) {
  const t = (value: string) => translate(locale, value);
  const [memories, setMemories] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setMemories(await storage.listMemories());
    } catch {
      setNotice("Could not read local memories.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    return storage.subscribeWrites(() => {
      if (storage.getWriteStatus().pending === 0) void refresh();
    });
  }, [refresh]);
  const save = async () => {
    setBusy(true);
    setNotice("");
    try {
      await storage.saveMemory(key, value);
      setKey("");
      setValue("");
      setEditing(false);
      await refresh();
    } catch {
      setNotice("Could not save memory. Check the key and value.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (name: string) => {
    setBusy(true);
    setNotice("");
    try {
      await storage.deleteMemory(name);
      if (key === name) {
        setKey("");
        setValue("");
        setEditing(false);
      }
      await refresh();
    } catch {
      setNotice("Could not delete memory.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card memory-settings">
      <h2>{t("Local memories")}</h2>
      <p>
        {t(
          "Memory entries stay on this device and are not included in backups. Tool records in chat backups may contain memory values sent to the model.",
        )}
      </p>
      {notice && <p role="status">{t(notice)}</p>}
      <label className="field">
        {t("Memory key")}
        <input
          value={key}
          maxLength={120}
          onChange={(event) => setKey(event.target.value)}
          disabled={disabled || busy || editing}
        />
      </label>
      <label className="field">
        {t("Memory value")}
        <textarea
          value={value}
          maxLength={2000}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled || busy}
        />
      </label>
      <button
        className="secondary"
        type="button"
        disabled={disabled || busy || !key.trim() || !value.trim()}
        onClick={() => void save()}
      >
        {t("Save memory")}
      </button>
      {editing && (
        <button
          className="secondary"
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            setEditing(false);
            setKey("");
            setValue("");
          }}
        >
          {t("Cancel")}
        </button>
      )}
      {memories.length > 0 && (
        <ul className="memory-list">
          {memories.map((memory) => (
            <li key={memory.key}>
              <div>
                <strong>{memory.key}</strong>
                <p>{memory.value}</p>
              </div>
              <div className="button-row">
                <button
                  className="secondary"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => {
                    setKey(memory.key);
                    setValue(memory.value);
                    setEditing(true);
                  }}
                >
                  {t("Edit")}
                </button>
                <button
                  className="danger"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void remove(memory.key)}
                >
                  {t("Delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
