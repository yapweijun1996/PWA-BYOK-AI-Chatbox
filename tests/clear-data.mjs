import assert from "node:assert/strict";
import { waitForSavedConversation } from "./browser-storage.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const section = (page, name) =>
  button(
    page.getByRole("navigation", { name: "Settings sections" }),
    name,
  ).click();
async function confirmClear(page, accept = true) {
  page.once("dialog", (dialog) =>
    accept ? dialog.accept() : dialog.dismiss(),
  );
  await button(page, "Clear all local data").click();
}
async function storedCounts(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["conversations", "settings"]);
          const chats = tx.objectStore("conversations").count();
          const prefs = tx.objectStore("settings").count();
          tx.oncomplete = () => {
            db.close();
            resolve([chats.result, prefs.result]);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
const held = (page, name) =>
  page.waitForFunction(
    (name) => typeof window.clearGates[name] === "function",
    name,
  );
async function release(page, name) {
  await held(page, name);
  await page.evaluate(async (name) => {
    window.clearGates[name]();
    // Resume the old action's promise continuations before inspecting the UI/DB.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, name);
}

export async function exerciseClearData(browser, url) {
  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.goto(url);
    await button(page, "Start a new chat").click();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Keep until deletion commits");
    await waitForSavedConversation(page, {
      draft: "Keep until deletion commits",
    });
    await button(page, "Local tools").click();
    const id = await page
      .locator("section.conversation")
      .getAttribute("data-conversation-id");
    const backup = Buffer.from(
      JSON.stringify({
        version: 1,
        settings: { theme: "dark" },
        conversations: [
          {
            id,
            title: "Fresh import",
            draft: "Explicitly restored",
            updatedAt: 1,
            messages: [],
          },
        ],
      }),
    );
    const chooseFile = (name) =>
      page
        .locator('input[accept="application/json,.json"]')
        .setInputFiles({ name, mimeType: "application/json", buffer: backup });
    const preview = page.getByRole("heading", { name: "Import preview" });
    const prefs = page.getByLabel(
      "Also import appearance and provider settings",
    );
    const key = page.getByPlaceholder("Enter key for this session");
    const save = page.getByLabel("Save encrypted on this device");
    const password = page.getByLabel("Unlock password", { exact: true });
    await button(page, "Settings").click();
    await key.fill("fixture-vault-key");
    await save.check();
    await password.fill("fixture password");
    await button(page, "Use key").click();
    await page
      .getByText("Key encrypted and unlocked on this device.")
      .waitFor();
    await key.fill("fixture-unsubmitted-key");
    await password.fill("fixture password");
    await button(page, "Show").click();
    await section(page, "Local data");
    await chooseFile("preview.json");
    await prefs.check();
    const before = await storedCounts(page);
    await confirmClear(page, false);
    assert.equal(await prefs.isChecked(), true);
    assert.deepEqual(await storedCounts(page), before);

    // A synchronous failure scheduling the second store clear must abort the first.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function () {
        if (this.name === "settings") {
          IDBObjectStore.prototype.clear = original;
          throw new DOMException("Fixture storage failure", "UnknownError");
        }
        return original.call(this);
      };
    });
    await confirmClear(page);
    await page
      .getByText("Could not clear local data. Nothing was deleted. Try again.")
      .waitFor();
    assert.deepEqual(await storedCounts(page), before);
    assert.equal(await prefs.isChecked(), true);
    await section(page, "AI providers");
    assert.equal(await key.inputValue(), "fixture-unsubmitted-key");
    assert.equal(await password.inputValue(), "fixture password");
    assert.equal(await key.getAttribute("type"), "text");

    await page.evaluate(() => {
      window.clearGates = {};
      window.holdClearResult = (name) =>
        new Promise((resolve) => {
          window.clearGates[name] = resolve;
        });
      for (const method of ["encrypt", "decrypt"]) {
        const original = SubtleCrypto.prototype[method];
        SubtleCrypto.prototype[method] = async function (...args) {
          SubtleCrypto.prototype[method] = original;
          const bytes = await original.apply(this, args);
          await window.holdClearResult(method);
          return bytes;
        };
      }
      // No real provider call. Model a response whose body finishes after abort.
      const originalFetch = window.fetch;
      window.fetch = async (_input, init) => {
        window.fetch = originalFetch;
        window.catalogSignal = init.signal;
        const response = new Response(null, { status: 200 });
        response.json = async () => {
          await window.holdClearResult("catalog");
          return {
            models: [
              {
                name: "models/stale-catalog",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          };
        };
        return response;
      };
      const clear = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function () {
        const req = clear.call(this);
        if (this.name === "settings") {
          IDBObjectStore.prototype.clear = clear;
          let allowCommit = false;
          req.onsuccess = () => {
            window.clearGates.commit = () => {
              allowCommit = true;
            };
            const hold = () => {
              if (!allowCommit) this.get("settings").onsuccess = hold;
            };
            hold();
          };
        }
        return req;
      };
    });
    await button(page, "Unlock saved key").click();
    await held(page, "decrypt");
    await button(page, "Use key").click();
    await held(page, "encrypt");
    await button(page, "Test connection").click();
    await held(page, "catalog");
    await section(page, "Local data");
    assert.equal(await prefs.isChecked(), true);
    await confirmClear(page);
    await held(page, "commit");
    await page.getByText("Clearing local data…", { exact: true }).waitFor();
    await release(page, "encrypt"); // Must not queue a vault write behind the delete.
    await release(page, "commit");
    await page.getByText("Local data cleared.", { exact: true }).waitFor();
    await preview.waitFor({ state: "detached" });
    assert.deepEqual(await storedCounts(page), [0, 0]);
    await section(page, "AI providers");
    await release(page, "decrypt");
    await release(page, "catalog");
    assert.equal(await page.evaluate(() => window.catalogSignal.aborted), true);
    assert.equal(await key.inputValue(), "");
    assert.equal(await key.getAttribute("type"), "password");
    assert.equal(await save.isChecked(), false);
    assert.equal(await button(page, "Lock").count(), 0);
    assert.equal(await button(page, "Unlock saved key").count(), 0);
    assert.equal(
      await page.locator('#model-list option[value="stale-catalog"]').count(),
      0,
    );
    assert.equal(
      await page.locator(".toast [role=status]").textContent(),
      "Local data cleared.",
    );
    await button(page, "Dismiss message").click();
    await save.check();
    assert.equal(await password.inputValue(), "");
    await section(page, "Local data");

    // A still-reading backup must not recreate a preview after another clear.
    await page.evaluate(() => {
      const read = Blob.prototype.text;
      Blob.prototype.text = async function () {
        Blob.prototype.text = read;
        const text = await read.call(this);
        await window.holdClearResult("file");
        return text;
      };
    });
    await chooseFile("late.json");
    await held(page, "file");
    await confirmClear(page);
    await page.getByText("Local data cleared.", { exact: true }).waitFor();
    await release(page, "file");
    assert.equal(await preview.count(), 0);
    assert.deepEqual(await storedCounts(page), [0, 0]);

    // An explicit action in the new session still works, without inheriting consent.
    await chooseFile("new-choice.json");
    await preview.waitFor();
    assert.equal(await prefs.isChecked(), false);
    await button(page, "Import and skip conflicts").click();
    await page.getByText("Imported 1 conversations.").waitFor();
    await button(page, "Back to chat").click();
    assert.equal(
      await button(page, "Local tools").getAttribute(
        "aria-pressed",
      ),
      "true",
    );
  } finally {
    await page.close();
  }
}
