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
