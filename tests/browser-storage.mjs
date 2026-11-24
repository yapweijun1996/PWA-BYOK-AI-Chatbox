export async function waitForSavedSettings(page, expected) {
  await page.waitForFunction(
    (expected) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("settings", "readonly");
          const read = transaction.objectStore("settings").get("settings");
          transaction.oncomplete = () => {
            db.close();
            resolve(
              Object.entries(expected).every(
                ([key, value]) => read.result?.[key] === value,
              ),
            );
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
    expected,
    { polling: 50 },
  );
}
