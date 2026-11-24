import type { Conversation, Settings } from "./types";
const DB = "luma-chat";
const VERSION = 1;
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("conversations"))
          db.createObjectStore("conversations", { keyPath: "id" });
        if (!db.objectStoreNames.contains("settings"))
          db.createObjectStore("settings");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(
          new Error("Storage is blocked by another tab. Close it and reload."),
        );
    });
  return database;
}
async function read<T>(store: string, all = false): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = all
      ? tx.objectStore(store).getAll()
      : tx.objectStore(store).get("settings");
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
async function write(
  store: string,
  action: (s: IDBObjectStore) => void,
): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    action(tx.objectStore(store));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("Storage transaction aborted"));
  });
}
export const storage = {
  conversations: () => read<Conversation[]>("conversations", true),
  settings: () => read<Settings | undefined>("settings"),
  saveConversation: (value: Conversation) =>
    write("conversations", (s) => {
      s.put(value);
    }),
  removeConversation: (key: string) =>
    write("conversations", (s) => {
      s.delete(key);
    }),
  saveSettings: (value: Settings) =>
    write("settings", (s) => {
      s.put(value, "settings");
    }),
  clear: async () => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["conversations", "settings"], "readwrite");
      tx.objectStore("conversations").clear();
      tx.objectStore("settings").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
