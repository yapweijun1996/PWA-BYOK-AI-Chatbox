import assert from "node:assert/strict";
import {
  waitForSavedConversation,
  waitForSavedSettings,
} from "./browser-storage.mjs";

const key = "legacy-shared-chat";
const title = "Shared notebook";
const ready = (page) => page.locator('html[data-startup="ready"]').waitFor();
const input = (page) =>
  page.getByRole("textbox", { name: "Message", exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const rows = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("conversations");
          const read = tx.objectStore("conversations").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(read.result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );

export async function exerciseCrossTabEditing(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    locale: "en-US",
  });
  const a = await context.newPage();
  const b = await context.newPage();
  const requests = [];
  try {
    await context.route("http://localhost:1234/v1/**", (route) => {
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      };
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      requests.push(route.request().postDataJSON().model);
      return route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Type": "text/event-stream" },
        body: 'data: {"choices":[{"delta":{"content":"Winning reply"}}]}\n\ndata: [DONE]\n\n',
      });
    });
    await a.goto(url);
    await ready(a);
    // Pre-revision v1 record, including an attachment in the buffered draft.
    await a.evaluate(
      ({ id, title }) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("luma-chat");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(
              ["conversations", "settings"],
              "readwrite",
            );
            tx.objectStore("conversations").add({
              id,
              title,
              updatedAt: 1,
              messages: [],
              draft: "Initial draft",
              draftAttachments: [
                {
                  id: "f",
                  name: "note.txt",
                  mime: "text/plain",
                  size: 4,
                  data: "note",
                },
              ],
            });
            tx.objectStore("settings").put(id, "activeConversation");
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
      { id: key, title },
    );
    await Promise.all([a.reload(), b.goto(url)]);
    await Promise.all([ready(a), ready(b)]);
    assert.equal(await input(b).inputValue(), "Initial draft");

    // B has already loaded old provider settings. Only B's theme should be written.
    await button(a, "Settings").click();
    await button(a, "LM Studio").click();
    await a.getByLabel("Model ID", { exact: true }).fill("cross-tab-model");
    await button(a, "Set as default provider").click();
    await waitForSavedSettings(a, { provider: "lmstudio" });
    await button(b, "Settings").click();
    await button(b, "Appearance").click();
    await b.getByLabel("Theme", { exact: true }).selectOption("dark");
    await waitForSavedSettings(b, { theme: "dark", provider: "lmstudio" });
    await Promise.all([
      button(a, "Back to chat").click(),
      button(b, "Back to chat").click(),
    ]);
    await button(a, "Send message").click();
    await a.getByText("Winning reply", { exact: true }).waitFor();
    await a.getByText("Saved locally", { exact: true }).waitFor();
    await input(a).fill("A's saved draft");
    await waitForSavedConversation(a, { id: key, draft: "A's saved draft" });
    const winner = (await rows(a)).find((c) => c.id === key);
    assert.ok(winner.localRevision);

    await input(b).fill("B's unsaved draft");
    const copy = button(b, "Save a separate copy");
    await copy.waitFor();
    assert.equal(await input(b).inputValue(), "B's unsaved draft");
    assert.deepEqual(
      (await rows(b)).find((c) => c.id === key),
      winner,
    );
    // An aborted recovery must keep B's edits and the recovery action available.
    await b.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, ...keys) {
        const request = add.call(this, value, ...keys);
        if (this.name === "conversations") {
          IDBObjectStore.prototype.add = add;
          request.addEventListener("success", () => this.transaction.abort());
        }
        return request;
      };
    });
    await copy.click();
    await b.getByText("Storage error:", { exact: false }).waitFor();
    assert.deepEqual(await rows(b), [winner]);
    assert.equal(await input(b).inputValue(), "B's unsaved draft");
    await copy.click();
    await copy.waitFor({ state: "detached" });
    const after = await rows(b);
    const fork = after.find((c) => c.id !== key);
    assert.equal(after.length, 2);
    assert.equal(fork.draft, "B's unsaved draft");
    assert.equal(fork.draftAttachments[0].data, "note");
    assert.deepEqual(
      after.find((c) => c.id === key),
      winner,
    );
    await b.reload();
    await ready(b);
    assert.equal(await input(b).inputValue(), fork.draft);
    await button(b.locator("#chat-sidebar"), title).click();
    await b.getByText("Winning reply", { exact: true }).waitFor();

    // B still has a sendable draft, but A deletes its record before B sends.
    await button(a, "Settings").click();
    await button(a, "Local data").click();
    a.once("dialog", (dialog) => dialog.accept());
    const remove = button(a, `Delete ${title}`);
    await remove.click();
    await remove.waitFor({ state: "detached" });
    await button(b, "Send message").click();
    await copy.waitFor();
    await copy.click();
    await copy.waitFor({ state: "detached" });
    const recovered = await rows(b);
    assert.ok(!recovered.some((c) => c.id === key));
    const deletedFork = recovered.find((c) => c.id !== fork.id);
    assert.equal(deletedFork.draft, winner.draft);
    assert.deepEqual(deletedFork.messages, winner.messages);
    assert.deepEqual(requests, ["cross-tab-model"]);
  } finally {
    await context.close();
  }
}
