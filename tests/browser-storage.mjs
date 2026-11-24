// Pause one real transaction after put() succeeds, before IDB can commit it.
export async function holdConversationWrite(page, match) {
  await page.evaluate((match) => {
    const original = IDBObjectStore.prototype.put;
    const gate = (window.localWriteGate = { held: false, decision: null });
    IDBObjectStore.prototype.put = function (record, ...rest) {
      const request = original.call(this, record, ...rest);
      if (
        this.name !== "conversations" ||
        record.title !== match.title ||
        (match.archived !== undefined && record.archived !== match.archived) ||
        (match.status && record.messages.at(-1)?.status !== match.status)
      )
        return request;
      IDBObjectStore.prototype.put = original;
      const keepAlive = () => {
        gate.held = true;
        if (gate.decision === "abort") this.transaction.abort();
        else if (gate.decision !== "commit")
          this.get(record.id).onsuccess = keepAlive;
      };
      request.addEventListener("success", keepAlive);
      return request;
    };
  }, match);
  return {
    held: () => page.waitForFunction(() => window.localWriteGate.held),
    release: (decision) =>
      page.evaluate((value) => {
        window.localWriteGate.decision = value;
      }, decision),
  };
}

export function waitForSavedSettings(page, expected) {
  return waitForStoredRecord(page, "settings", "settings", expected);
}

export function waitForSavedConversation(page, expected) {
  return waitForStoredRecord(page, "conversations", undefined, expected);
}

async function waitForStoredRecord(page, store, key, expected) {
  await page.waitForFunction(
    ({ store, key, expected }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction(store, "readonly");
          const records = transaction.objectStore(store);
          const read = key === undefined ? records.getAll() : records.get(key);
          transaction.oncomplete = () => {
            db.close();
            const found = key === undefined ? read.result : [read.result];
            resolve(
              found.some((record) =>
                Object.entries(expected).every(
                  ([field, value]) => record?.[field] === value,
                ),
              ),
            );
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
    { store, key, expected },
    { polling: 50 },
  );
}
