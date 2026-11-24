import assert from "node:assert/strict";

// Read the committed records together, including the existing test vault and selection.
function storedWorkspace(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["settings", "conversations"]);
          const prefs = tx.objectStore("settings");
          const settings = prefs.get("settings");
          const active = prefs.get("activeConversation");
          const chats = tx.objectStore("conversations").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve({
              settings: settings.result,
              active: active.result,
              chats: chats.result,
            });
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}

export async function exerciseAtomicImport(page) {
  const before = await storedWorkspace(page);
  assert.ok(before.settings.vaults.openai);
  const chat = (id) => ({
    id,
    title: id,
    draft: "portable draft",
    updatedAt: 1,
    messages: [],
  });
  const data = {
    version: 1,
    settings: {
      theme: before.settings.theme === "dark" ? "light" : "dark",
      vaults: {},
    },
    projects: [{ id: "import-project", name: "Import project" }],
    conversations: [
      chat("import-first"),
      { ...chat("import-second"), projectId: "import-project" },
    ],
  };
  const preview = page.getByRole("heading", { name: "Import preview" });
  const openPreview = async (backup) => {
    await page.locator('input[accept="application/json,.json"]').setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await preview.waitFor();
  };
  const skip = page.getByRole("button", { name: "Import and skip conflicts" });
  const replace = page.getByRole("button", { name: "Replace conflicts" });
  const preferences = page.getByLabel(
    "Also import appearance and provider settings",
  );
  const openData = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Local data", exact: true }).click();
  };
  await openPreview(data);
  await preferences.check();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await preview.waitFor({ state: "detached" });
  assert.deepEqual(await storedWorkspace(page), before);

  await openPreview(data);
  assert.equal(await preferences.isChecked(), false);
  await preferences.check();
  // Force an asynchronous constraint error on the second real write. The first
  // record, imported project, preference and local vault must all roll back.
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (record, ...keys) {
      if (this.name === "conversations" && record.id === "import-second") {
        IDBObjectStore.prototype.add = add;
        return add.call(this, { ...record, id: "import-first" }, ...keys);
      }
      return add.call(this, record, ...keys);
    };
  });
  await skip.click();
  await page
    .getByText(
      "Import failed. Nothing was imported; your existing data and saved keys are unchanged.",
    )
    .waitFor();
  assert.equal(
    await page
      .locator(".data-item")
      .filter({ hasText: "import-first" })
      .count(),
    0,
  );
  await page.reload();
  await openData();
  assert.deepEqual(await storedWorkspace(page), before);

  await openPreview(data);
  await preferences.check();
  await skip.click();
  await page.getByText("Imported 2 conversations.").waitFor();
  const committed = await storedWorkspace(page);
  assert.deepEqual(committed.settings.vaults, before.settings.vaults);
  assert.equal(committed.settings.theme, data.settings.theme);
  assert.ok(
    committed.settings.projects.some(({ id }) => id === "import-project"),
  );
  assert.equal(committed.active, before.active);
  const legacy = {
    version: 1,
    conversations: [{ ...chat("import-first"), draft: "explicit replacement" }],
  };
  await openPreview(legacy);
  page.once("dialog", (d) => d.accept());
  await replace.click();
  await page.getByText("Imported 1 conversations.").waitFor();
  assert.equal(
    (await storedWorkspace(page)).chats.find((c) => c.id === "import-first")
      .draft,
    "explicit replacement",
  );

  await openPreview(legacy);
  const sibling = await page.context().newPage();
  try {
    await sibling.goto(page.url());
    await sibling.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("luma-chat");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("conversations", "readwrite");
            const chats = tx.objectStore("conversations");
            const get = chats.get("import-first");
            get.onsuccess = () =>
              chats.put({ ...get.result, draft: "changed in another tab" });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => {
              db.close();
              reject(tx.error);
            };
          };
        }),
    );
    page.once("dialog", (d) => d.accept());
    await replace.click();
    await page
      .getByText("Local data changed since preview. Nothing was imported.", {
        exact: false,
      })
      .waitFor();
    assert.equal(
      (await storedWorkspace(page)).chats.find((c) => c.id === "import-first")
        .draft,
      "changed in another tab",
    );
  } finally {
    await sibling.close();
  }
}
