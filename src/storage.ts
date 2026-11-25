import { mergeSettings, recoverMessage } from "./data-contracts";
import type { Conversation, Settings } from "./types";

import { applySettingsEdit } from "./settings-edit";

export class ImportConflictError extends Error {}
export class ConversationConflictError extends Error {
  constructor(readonly chatId: string) {
    super("Conversation changed or was deleted in another tab.");
  }
}

type StoredChat = Conversation & { localRevision?: string };
// Per-page cursor: advance only on restore, explicit recovery, or our own commit.
// Keep the original legacy snapshot until its first versioned write.
const observed = new Map<string, string | StoredChat>();
function observe(row: StoredChat) {
  observed.set(
    row.id,
    typeof row.localRevision === "string" ? row.localRevision : row,
  );
}
function contentOf({
  localRevision: _deviceOnly,
  ...content
}: StoredChat): Conversation {
  return content;
}
function matches(
  expected: string | StoredChat | undefined,
  row: StoredChat | undefined,
) {
  if (!row || expected === undefined) return false;
  return typeof expected === "string"
    ? expected === row.localRevision
    : JSON.stringify(expected) === JSON.stringify(row);
}
function readThen<T>(
  request: IDBRequest<T>,
  abort: (reason: unknown) => void,
  use: (value: T) => void,
) {
  request.onsuccess = () => {
    try {
      use(request.result);
    } catch (error) {
      abort(error);
    }
  };
}

const DB = "luma-chat";
// Older clients flatten message history and could send hidden branches. Bump
// the database version so they cannot reopen a branch-aware workspace.
const VERSION = 2;
const ACTIVE_KEY = "activeConversation";
let database: Promise<IDBDatabase> | undefined;
let writeStatus = {
  pending: 0,
  revision: 0,
  lastOutcome: "none" as "none" | "committed" | "failed",
};
const listeners = new Set<() => void>();
function updateStatus(next: Partial<typeof writeStatus>) {
  writeStatus = { ...writeStatus, ...next };
  for (const listener of listeners) listener();
}
async function trackWrite(action: () => Promise<void>) {
  updateStatus({ pending: writeStatus.pending + 1 });
  let lastOutcome: typeof writeStatus.lastOutcome = "failed";
  try {
    await action();
    lastOutcome = "committed";
  } finally {
    updateStatus({
      pending: writeStatus.pending - 1,
      revision: writeStatus.revision + 1,
      lastOutcome,
    });
  }
}

export class StorageBlockedError extends Error {}

function open(signal?: AbortSignal): Promise<IDBDatabase> {
  if (database) return database;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    let abandoned = false;
    const fail = (reason: unknown) => {
      if (abandoned) return;
      abandoned = true;
      signal?.removeEventListener("abort", abort);
      reject(reason);
    };
    const abort = () => {
      fail(signal?.reason);
      try {
        request.transaction?.abort();
      } catch {
        // A completed upgrade cannot be aborted; close its late connection instead.
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.onupgradeneeded = () => {
      if (abandoned) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains("conversations"))
        db.createObjectStore("conversations", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings"))
        db.createObjectStore("settings");
    };
    request.onsuccess = () => {
      const db = request.result;
      signal?.removeEventListener("abort", abort);
      if (abandoned) {
        db.close();
        return;
      }
      const invalidate = () => {
        if (database === pending) database = undefined;
      };
      db.onclose = invalidate;
      db.onversionchange = () => {
        db.close();
        invalidate();
      };
      resolve(db);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new StorageBlockedError());
  });
  database = pending;
  void pending.catch(() => {
    if (database === pending) database = undefined;
  });
  return pending;
}

async function restore(signal: AbortSignal, onDatabaseReady: () => void) {
  signal.throwIfAborted();
  const db = await open(signal);
  signal.throwIfAborted();
  onDatabaseReady();
  return new Promise<{
    conversations: Conversation[];
    settings: Settings | undefined;
    active: unknown;
  }>((resolve, reject) => {
    const tx = db.transaction(["conversations", "settings"], "readonly");
    const preferences = tx.objectStore("settings");
    const settings = preferences.get("settings");
    const active = preferences.get(ACTIVE_KEY);
    const conversations = tx.objectStore("conversations").getAll();
    const abort = () => {
      try {
        tx.abort();
      } catch {
        /* The transaction already finished. */
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    tx.oncomplete = () => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(signal.reason);
      else {
        observed.clear();
        const rows: StoredChat[] = conversations.result;
        rows.forEach(observe);
        resolve({
          conversations: rows.map(contentOf),
          settings: settings.result,
          active: active.result,
        });
      }
    };
    tx.onabort = () => {
      signal.removeEventListener("abort", abort);
      reject(
        signal.aborted
          ? signal.reason
          : (tx.error ?? new Error("Storage restore aborted")),
      );
    };
  });
}

function writeTransaction(
  stores: string | string[],
  action: (tx: IDBTransaction, abort: (reason: unknown) => void) => void,
) {
  return trackWrite(async () => {
    const db = await open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      let failure: unknown;
      const abort = (reason: unknown) => {
        failure = reason;
        tx.abort();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Storage transaction aborted"));
      try {
        action(tx, abort);
      } catch (error) {
        abort(error);
      }
    });
  });
}

// ACTIVE_KEY is a shared resume hint. Do not replace a different tab's selection
// as a side effect of archiving/deleting, or persist a link to a missing fallback.
function moveSelection(
  tx: IDBTransaction,
  abort: (reason: unknown) => void,
  from: string,
  to: string,
) {
  const prefs = tx.objectStore("settings");
  readThen(prefs.get(ACTIVE_KEY), abort, (active) => {
    if (active != null && active !== from) return;
    if (!to) {
      prefs.delete(ACTIVE_KEY);
      return;
    }
    readThen(tx.objectStore("conversations").getKey(to), abort, (key) => {
      if (key === undefined) throw new ConversationConflictError(to);
      prefs.put(to, ACTIVE_KEY);
    });
  });
}

async function inspectRepository() {
  const db = await open();
  return new Promise<{
    name: string;
    version: number;
    conversationCount: number;
  }>((resolve, reject) => {
    const transaction = db.transaction("conversations", "readonly");
    const count = transaction.objectStore("conversations").count();
    transaction.oncomplete = () =>
      resolve({
        name: db.name,
        version: db.version,
        conversationCount: count.result,
      });
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Storage inspection aborted"));
  });
}

export const storage = {
  restore,
  inspectRepository,
  getWriteStatus: () => writeStatus,
  subscribeWrites(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async listMemories() {
    const db = await open();
    return new Promise<{ key: string; value: string }[]>((resolve, reject) => {
      const tx = db.transaction("settings", "readonly");
      const store = tx.objectStore("settings");
      const range = IDBKeyRange.bound("memory:", "memory;", false, true);
      const keys = store.getAllKeys(range);
      const values = store.getAll(range);
      tx.oncomplete = () => resolve(keys.result.flatMap((key, index) =>
        typeof key === "string" && key.startsWith("memory:") && typeof values.result[index] === "string"
          ? [{ key: key.slice(7), value: values.result[index] as string }]
          : [],
      ));
      tx.onabort = () => reject(tx.error ?? new Error("Could not read memories."));
    });
  },
  async saveMemory(key: string, value: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!key.trim() || key.length > 120 || !value.trim() || value.length > 2000)
      throw new Error("Memory requires a key of at most 120 characters and a value of at most 2000 characters.");
    await writeTransaction("settings", (tx, abortWrite) => {
      signal?.throwIfAborted();
      const abort = () => { try { tx.abort(); } catch {} };
      signal?.addEventListener("abort", abort, { once: true });
      tx.addEventListener("complete", () => signal?.removeEventListener("abort", abort));
      tx.addEventListener("abort", () => signal?.removeEventListener("abort", abort));
      const store = tx.objectStore("settings");
      const storageKey = `memory:${key.trim()}`;
      readThen(store.getKey(storageKey), abortWrite, (existing) => {
        if (existing !== undefined) {
          store.put(value, storageKey);
          return;
        }
        readThen(store.count(IDBKeyRange.bound("memory:", "memory;", false, true)), abortWrite, (count) => {
          if (count >= 100) throw new Error("Memory limit reached.");
          store.put(value, storageKey);
        });
      });
    });
  },
  async deleteMemory(key: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    await writeTransaction("settings", (tx) => {
      signal?.throwIfAborted();
      const abort = () => { try { tx.abort(); } catch {} };
      signal?.addEventListener("abort", abort, { once: true });
      tx.addEventListener("complete", () => signal?.removeEventListener("abort", abort));
      tx.addEventListener("abort", () => signal?.removeEventListener("abort", abort));
      tx.objectStore("settings").delete(`memory:${key}`);
    });
  },
  // Archiving the selected chat also commits its replacement selection (or none).
  async saveConversation(value: Conversation, nextActive?: string) {
    const expected = observed.get(value.id);
    const row = { ...value, localRevision: crypto.randomUUID() };
    await writeTransaction(
      nextActive === undefined
        ? "conversations"
        : ["conversations", "settings"],
      (tx, abort) => {
        const chats = tx.objectStore("conversations");
        readThen(
          chats.get(value.id),
          abort,
          (stored: StoredChat | undefined) => {
            if (!matches(expected, stored))
              throw new ConversationConflictError(value.id);
            chats.put(row);
            if (nextActive !== undefined)
              moveSelection(tx, abort, value.id, nextActive);
          },
        );
      },
    );
    observe(row);
  },
  // Compare previewed records inside the write transaction, not in a separate
  // preflight read. Legacy v1 records have no reliable modification counter.
  async importBackup(plan: {
    records: { previous?: Conversation; next: Conversation }[];
    settings?: { previous: Settings; next: Settings };
    active?: { previous: string; next: string };
  }) {
    const rows = plan.records.map(({ previous, next }) => ({
      previous,
      next: { ...next, localRevision: crypto.randomUUID() },
    }));
    await writeTransaction(["conversations", "settings"], (tx, abort) => {
      const chats = tx.objectStore("conversations");
      const prefs = tx.objectStore("settings");
      function checked<T>(request: IDBRequest<T>, write: (stored: T) => void) {
        readThen(request, abort, write);
      }
      for (const { previous, next } of rows) {
        checked(chats.get(next.id), (stored: StoredChat | undefined) => {
          if (previous && !matches(observed.get(previous.id), stored))
            throw new ImportConflictError();
          const restored = stored && {
            ...contentOf(stored),
            messages: stored.messages.map(recoverMessage),
          };
          if (JSON.stringify(restored) !== JSON.stringify(previous))
            throw new ImportConflictError();
          if (previous) chats.put(next);
          else chats.add(next);
        });
      }
      if (plan.settings) {
        const { previous, next } = plan.settings;
        checked(prefs.get("settings"), (stored: Settings | undefined) => {
          if (
            JSON.stringify(mergeSettings(stored)) !==
            JSON.stringify(mergeSettings(previous))
          )
            throw new ImportConflictError();
          prefs.put({ ...next, vaults: stored?.vaults ?? {} }, "settings");
        });
      }
      if (plan.active) {
        const { previous, next } = plan.active;
        checked(prefs.get(ACTIVE_KEY), (stored: unknown) => {
          // A legacy workspace may have restored a fallback without a saved selection.
          if (stored != null && stored !== previous)
            throw new ImportConflictError();
          if (next) prefs.put(next, ACTIVE_KEY);
          else prefs.delete(ACTIVE_KEY);
        });
      }
    });
    rows.forEach(({ next }) => observe(next));
  },
  async createActiveConversation(value: Conversation) {
    const row = { ...value, localRevision: crypto.randomUUID() };
    await writeTransaction(["conversations", "settings"], (tx) => {
      tx.objectStore("conversations").add(row);
      tx.objectStore("settings").put(value.id, ACTIVE_KEY);
    });
    observe(row);
  },
  async recoverConversation(
    originalId: string,
    copy: Conversation,
    activate: boolean,
  ) {
    const row = { ...copy, localRevision: crypto.randomUUID() };
    let read!: IDBRequest<StoredChat | undefined>;
    await writeTransaction(["conversations", "settings"], (tx) => {
      const chats = tx.objectStore("conversations");
      read = chats.get(originalId);
      chats.add(row);
      if (activate) tx.objectStore("settings").put(copy.id, ACTIVE_KEY);
    });
    observe(row);
    const original = read.result;
    if (!original) {
      observed.delete(originalId);
      return undefined;
    }
    observe(original);
    return {
      ...contentOf(original),
      messages: original.messages.map(recoverMessage),
    };
  },
  async removeConversation(key: string, fallback: string) {
    const expected = observed.get(key);
    await writeTransaction(["conversations", "settings"], (tx, abort) => {
      const chats = tx.objectStore("conversations");
      readThen(chats.get(key), abort, (stored) => {
        if (!matches(expected, stored))
          throw new ConversationConflictError(key);
        chats.delete(key);
        moveSelection(tx, abort, key, fallback);
      });
    });
    observed.delete(key);
  },
  async saveSettings(previous: Settings, next: Settings) {
    let committed!: Settings;
    await writeTransaction("settings", (tx, abort) => {
      const prefs = tx.objectStore("settings");
      readThen(prefs.get("settings"), abort, (stored) => {
        const edited = applySettingsEdit(stored, previous, next);
        prefs.put(edited, "settings");
        committed = mergeSettings(edited);
      });
    });
    return committed;
  },
  saveActiveConversation: (id: string) =>
    writeTransaction(["settings", "conversations"], (tx, abort) => {
      const prefs = tx.objectStore("settings");
      if (!id) {
        prefs.delete(ACTIVE_KEY);
        return;
      }
      readThen(tx.objectStore("conversations").getKey(id), abort, (key) => {
        if (key === undefined) throw new ConversationConflictError(id);
        prefs.put(id, ACTIVE_KEY);
      });
    }),
  async clear() {
    await writeTransaction(["conversations", "settings"], (tx) => {
      tx.objectStore("conversations").clear();
      tx.objectStore("settings").clear();
    });
    observed.clear();
  },
};
