import type { Conversation, Settings } from "./types";

const DB = "luma-chat";
const VERSION = 1;
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
      else
        resolve({
          conversations: conversations.result,
          settings: settings.result,
          active: active.result,
        });
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
  action: (tx: IDBTransaction) => void,
) {
  return trackWrite(async () => {
    const db = await open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, "readwrite");
      action(tx);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error("Storage transaction aborted"));
    });
  });
}

function write(store: string, action: (s: IDBObjectStore) => void) {
  return writeTransaction(store, (tx) => action(tx.objectStore(store)));
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
  saveConversation: (value: Conversation) =>
    write("conversations", (s) => {
      s.put(value);
    }),
  createActiveConversation: (value: Conversation) =>
    writeTransaction(["conversations", "settings"], (tx) => {
      tx.objectStore("conversations").add(value);
      tx.objectStore("settings").put(value.id, ACTIVE_KEY);
    }),
  removeConversation: (key: string) =>
    write("conversations", (s) => {
      s.delete(key);
    }),
  saveSettings: (value: Settings) =>
    write("settings", (s) => {
      s.put(value, "settings");
    }),
  saveActiveConversation: (id: string) =>
    write("settings", (s) => {
      if (id) s.put(id, ACTIVE_KEY);
      else s.delete(ACTIVE_KEY);
    }),
  clear: () =>
    trackWrite(async () => {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["conversations", "settings"], "readwrite");
        tx.objectStore("conversations").clear();
        tx.objectStore("settings").clear();
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(tx.error || new Error("Storage transaction aborted"));
      });
    }),
};
