import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { waitForSavedConversation } from "./browser-storage.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1000, height: 700 },
  });
  const page = await context.newPage();
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
  await page.goto(base);
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["conversations", "settings"], "readwrite");
          const chats = tx.objectStore("conversations");
          chats.put({
            id: "source",
            title: "Source chat",
            updatedAt: 3,
            draft: "old draft",
            messages: [],
          });
          chats.put({
            id: "archive",
            title: "Archived item",
            updatedAt: 1,
            archived: true,
            draft: "",
            messages: [
              {
                id: "arch-message",
                role: "user",
                content: "Archived secret",
                createdAt: 1,
                status: "complete",
              },
              {
                id: "arch-reply",
                role: "assistant",
                content: "Archived secret follow up",
                createdAt: 2,
                status: "complete",
              },
            ],
          });
          chats.put({
            id: "bulk",
            title: "Bulk search",
            updatedAt: 1,
            draft: "",
            messages: Array.from({ length: 105 }, (_, index) => ({
              id: `bulk-${index}`,
              role: "user",
              content: `bulk-keyword <img src=x onerror=alert(1)> ${index}`,
              createdAt: index + 1,
              status: "complete",
            })),
          });
          chats.put({
            id: "target",
            title: "Target chat",
            updatedAt: 2,
            draft: "target draft",
            branchVersion: 1,
            activeMessageId: "child",
            preferredBranches: { "": "root", root: "b", b: "child" },
            messages: [
              {
                id: "root",
                parentId: null,
                role: "user",
                content: "Shared topic",
                createdAt: 1,
                status: "complete",
              },
              {
                id: "a",
                parentId: "root",
                role: "assistant",
                content: "Hidden needle",
                createdAt: 2,
                status: "complete",
              },
              {
                id: "b",
                parentId: "root",
                role: "assistant",
                content: "Other path",
                createdAt: 3,
                status: "complete",
              },
              {
                id: "child",
                parentId: "b",
                role: "user",
                content: "Follow up",
                createdAt: 4,
                status: "complete",
              },
            ],
          });
          tx.objectStore("settings").put("source", "activeConversation");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Unsaved source draft");
  const dialog = page.getByRole("dialog", { name: "Search conversations" });
  const search = dialog.getByRole("searchbox", {
    name: "Search conversations",
  });
  const openSearch = async (query) => {
    await page.keyboard.press("Control+k");
    await search.fill(query);
  };
  await page.setViewportSize({ width: 320, height: 700 });
  await openSearch("hidden needle");
  assert.equal(await dialog.locator(".search-group").count(), 1);
  assert.equal(
    await dialog.locator("mark").first().textContent(),
    "Hidden needle",
  );
  const lightColor = await dialog
    .locator(".search-group")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  assert.notEqual(
    await dialog
      .locator(".search-group")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    lightColor,
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  assert.ok(
    await dialog.evaluate(
      (element) =>
        element.getBoundingClientRect().right <= innerWidth &&
        element.scrollWidth <= element.clientWidth,
    ),
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: /Target chat.*Hidden needle/ })
      .count(),
    1,
  );
  await dialog
    .getByRole("button", { name: /Target chat.*Hidden needle/ })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const hidden = page.locator('[data-message-id="a"]');
  await hidden.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-message-id") === "a",
  );
  assert.equal(await hidden.getAttribute("data-search-match"), "true");
  assert.equal(await page.getByText("Other path", { exact: true }).count(), 0);
  assert.equal(await input.inputValue(), "target draft");
  await page.setViewportSize({ width: 1000, height: 700 });
  await waitForSavedConversation(page, {
    title: "Source chat",
    draft: "Unsaved source draft",
  });
  await page.reload();
  await page.getByText("Hidden needle", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next version" }).click();
  await page.getByText("Follow up", { exact: true }).waitFor();
  await openSearch("shared topic");
  assert.equal(
    await dialog
      .getByRole("button", { name: /Target chat.*Shared topic/ })
      .count(),
    1,
  );
  await dialog
    .getByRole("button", { name: /Target chat.*Shared topic/ })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Follow up", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-message-id") === "root",
  );

  let releaseReply;
  const replyGate = new Promise((resolve) => {
    releaseReply = resolve;
  });
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    await replyGate;
    await route
      .fulfill({
        headers: { ...headers, "Content-Type": "text/event-stream" },
        body: 'data: {"choices":[{"delta":{"content":"Done"}}]}\n\ndata: [DONE]\n\n',
      })
      .catch(() => {});
  });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID").fill("mock-search-model");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await input.fill("Waiting for reply");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Stop generating" }).waitFor();
  await openSearch("hidden needle");
  await dialog
    .getByRole("button", { name: /Target chat.*Hidden needle/ })
    .click();
  await dialog
    .getByRole("alert")
    .getByText(
      "Finish the current reply or attachment task before opening a message result.",
    )
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Stop generating" }).click();
  releaseReply();
  await page
    .getByRole("button", { name: "Stop generating" })
    .waitFor({ state: "hidden" });
  await page
    .locator(".message.assistant")
    .last()
    .getByText("Saved locally", { exact: true })
    .waitFor();
  await input.fill("target draft");

  await page
    .locator('[data-message-id="root"]')
    .getByRole("button", { name: "Edit as new message" })
    .click();
  await page
    .getByRole("dialog", { name: "Replace current draft?" })
    .getByRole("button", { name: "Edit message" })
    .click();
  await page
    .getByText("Editing a previous message. The original stays in the chat.")
    .waitFor();
  await openSearch("hidden needle");
  await dialog
    .getByRole("button", { name: /Target chat.*Hidden needle/ })
    .click();
  await dialog
    .getByRole("alert")
    .getByText("Finish or cancel editing before changing branches.")
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel edit" }).click();
  assert.equal(await input.inputValue(), "target draft");

  await openSearch("hidden needle");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "conversations") {
        IDBObjectStore.prototype.put = original;
        throw new DOMException("Simulated failure", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  await dialog
    .getByRole("button", { name: /Target chat.*Hidden needle/ })
    .click();
  await dialog
    .getByRole("alert")
    .getByText("Could not open this message. Your work is unchanged.")
    .waitFor();
  assert.equal(await page.locator('[data-message-id="child"]').count(), 1);
  await dialog
    .getByRole("button", { name: /Target chat.*Hidden needle/ })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Hidden needle", { exact: true }).waitFor();

  await openSearch("archived secret");
  await dialog.getByRole("button", { name: "Archived", exact: true }).click();
  assert.equal(
    await dialog.getByRole("button", { name: "Restore Archived item" }).count(),
    1,
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: /Archived item.*Archived secret/ })
      .count(),
    2,
  );
  await search.press("ArrowDown");
  assert.equal(
    await dialog
      .getByRole("button", { name: /Archived item.*Archived secret/ })
      .first()
      .evaluate((element) => element.matches(":focus")),
    true,
  );
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Archived secret", { exact: true }).waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Source chat", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector(".composer textarea")?.value ===
      "Unsaved source draft",
  );
  await openSearch("other path");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "conversations") {
        IDBObjectStore.prototype.put = original;
        throw new DOMException("Simulated failure", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  await dialog.getByRole("button", { name: /Target chat.*Other path/ }).click();
  await dialog
    .getByRole("alert")
    .getByText("Could not open this message. Your work is unchanged.")
    .waitFor();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Search conversations",
  );
  const persisted = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["settings", "conversations"], "readonly");
          const active = tx.objectStore("settings").get("activeConversation");
          const target = tx.objectStore("conversations").get("target");
          tx.oncomplete = () => {
            db.close();
            resolve([active.result, target.result.activeMessageId]);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  assert.deepEqual(persisted, ["source", "a"]);
  assert.equal(await input.inputValue(), "Unsaved source draft");
  await page.keyboard.press("Escape");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Target chat", exact: true })
    .click();
  await page.getByText("Hidden needle", { exact: true }).waitFor();

  const other = await context.newPage();
  await other.goto(base);
  await other.locator('html[data-startup="ready"]').waitFor();
  await other.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("conversations", "readwrite");
          const store = tx.objectStore("conversations");
          const read = store.get("target");
          read.onsuccess = () =>
            store.put({
              ...read.result,
              title: "Other tab saved",
              localRevision: crypto.randomUUID(),
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await openSearch("other path");
  await dialog.getByRole("button", { name: /Target chat.*Other path/ }).click();
  await dialog
    .getByRole("alert")
    .getByText("Could not open this message. Your work is unchanged.")
    .waitFor();
  assert.equal(await page.locator('[data-message-id="a"]').count(), 1);
  await other.close();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.bringToFront();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Search conversations", exact: true })
    .click();
  await search.fill("bulk-keyword");
  assert.equal(await dialog.locator(".search-group").count(), 1);
  assert.equal(await dialog.locator(".search-result-open").count(), 100);
  await dialog
    .getByText("Showing the first 100 results. Refine your search to see more.")
    .waitFor();
  assert.equal(await dialog.locator("img").count(), 0);
  const chinese = await browser.newPage({
    locale: "zh-CN",
    viewport: { width: 320, height: 700 },
  });
  await chinese.goto(base);
  await chinese.locator('html[data-startup="ready"]').waitFor();
  await chinese.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("conversations", "readwrite");
          tx.objectStore("conversations").put({
            id: "zh",
            title: "研究",
            updatedAt: 1,
            draft: "",
            messages: [
              {
                id: "zh-message",
                role: "user",
                content: "搜索关键词",
                createdAt: 1,
                status: "complete",
              },
            ],
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await chinese.reload();
  await chinese.locator('html[data-startup="ready"]').waitFor();
  await chinese.keyboard.press("Control+k");
  const chineseDialog = chinese.getByRole("dialog", { name: "搜索对话" });
  await chineseDialog
    .getByRole("searchbox", { name: "搜索对话" })
    .fill("关键词");
  await chineseDialog
    .getByRole("button", { name: /研究.*消息匹配.*关键词/ })
    .waitFor();
  assert.equal(await chineseDialog.locator("mark").textContent(), "关键词");
  await chinese.close();
  console.log(
    "PASS: branch search, shared ancestors, drafts, editing guard, rollback and cross-tab conflict",
  );
} finally {
  await browser.close();
}
