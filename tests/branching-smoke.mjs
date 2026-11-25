import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1000, height: 740 },
  });
  const requests = [];
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (request.url().endsWith("/models"))
      return route.fulfill({
        headers,
        json: { data: [{ id: "branch-model" }] },
      });
    requests.push(request.postDataJSON());
    return route.fulfill({
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: `data: ${JSON.stringify({ choices: [{ delta: { content: `Answer ${requests.length}` } }] })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID").fill("branch-model");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  assert.equal(
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.open("luma-chat", 1);
          request.onerror = () => resolve(request.error?.name);
          request.onsuccess = () => {
            request.result.close();
            resolve("unexpected success");
          };
        }),
    ),
    "VersionError",
  );
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const send = async (text, number) => {
    await input.fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
    const message = page
      .locator(".message.assistant")
      .filter({ hasText: `Answer ${number}` });
    await message.getByText("Saved locally", { exact: true }).waitFor();
    return message;
  };
  const retry = async (message, number) => {
    await message.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Retry reply?" })
      .getByRole("button", { name: "Retry reply", exact: true })
      .click();
    const answer = page
      .locator(".message.assistant")
      .filter({ hasText: `Answer ${number}` });
    await answer.getByText("Saved locally", { exact: true }).waitFor();
    return answer;
  };
  const first = await send("First question", 1);
  const second = await retry(first, 2);
  assert.equal(requests[1].messages.length, 1);
  assert.equal(await page.getByText("Answer 1", { exact: true }).count(), 0);
  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal(
    await second
      .locator(".message-actions")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
  assert.ok(
    (
      await second
        .getByRole("button", { name: "Previous version" })
        .boundingBox()
    ).height >= 44,
  );
  await page.setViewportSize({ width: 1000, height: 740 });
  await send("Follow up", 3);
  assert.deepEqual(
    requests[2].messages.map((message) => message.content),
    ["First question", "Answer 2", "Follow up"],
  );
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "conversations") {
        IDBObjectStore.prototype.put = original;
        throw new DOMException(
          "Simulated storage failure",
          "QuotaExceededError",
        );
      }
      return original.apply(this, args);
    };
  });
  await second.getByRole("button", { name: "Previous version" }).click();
  await page.getByText(/Storage error:/).waitFor();
  await page.getByText("Answer 3", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await second.getByRole("button", { name: "Previous version" }).click();
  await page.getByText("Answer 1", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("branch-control"),
  );
  assert.equal(await page.getByText("Follow up", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Next version" }).click();
  await page.getByText("Answer 3", { exact: true }).waitFor();
  await retry(second, 4);
  assert.equal(requests[3].messages.length, 1);
  assert.equal(await page.getByText("Follow up", { exact: true }).count(), 0);
  const user = page
    .locator(".message.user")
    .filter({ hasText: "First question" });
  await user.getByRole("button", { name: "Edit as new message" }).click();
  await input.fill("Edited question");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Answer 5", { exact: true }).waitFor();
  assert.equal(requests[4].messages.length, 1);
  assert.equal(requests[4].messages[0].content, "Edited question");
  const edited = page
    .locator(".message.user")
    .filter({ hasText: "Edited question" });
  await edited.getByRole("button", { name: "Previous version" }).click();
  await page.getByText("Answer 4", { exact: true }).waitFor();
  await page
    .locator(".message.user")
    .filter({ hasText: "First question" })
    .getByRole("button", { name: "Next version" })
    .click();
  await page.getByText("Answer 5", { exact: true }).waitFor();
  await edited.getByRole("button", { name: "Delete branch" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete branch?" });
  await dialog
    .getByText("Delete this branch and its 2 messages? This cannot be undone.")
    .waitFor();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await edited.count(), 1);
  await edited.getByRole("button", { name: "Delete branch" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "conversations") { IDBObjectStore.prototype.put = original; throw new DOMException("Simulated delete failure", "QuotaExceededError"); }
      return original.apply(this, args);
    };
  });
  await dialog.getByRole("button", { name: "Delete branch", exact: true }).click();
  await page.getByText(/Storage error:/).waitFor();
  await page.getByText("Answer 5", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await edited.getByRole("button", { name: "Delete branch" }).click();
  // Hold an IndexedDB write transaction so the branch cannot be committed yet.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("luma-chat");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("conversations", "readwrite");
      const store = tx.objectStore("conversations");
      window.releaseBranchTestLock = false;
      const keepAlive = () => {
        const read = store.count();
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          if (!window.branchTestLockAcquired) { window.branchTestLockAcquired = true; resolve(); }
          if (!window.releaseBranchTestLock) keepAlive();
        };
      };
      tx.oncomplete = () => db.close();
      keepAlive();
    };
  }));
  await dialog
    .getByRole("button", { name: "Delete branch", exact: true })
    .click();
  await page.getByText("Answer 5", { exact: true }).waitFor();
  assert.equal(await page.getByText("Answer 4", { exact: true }).count(), 0);
  await page.evaluate(() => { window.releaseBranchTestLock = true; });
  await page.getByText("Answer 4", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Edited question", { exact: true }).count(),
    0,
  );
  await page.reload();
  await page.getByText("Answer 4", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Previous version" }).click();
  await page.getByText("Answer 3", { exact: true }).waitFor();
  const legacy = await browser.newPage({ locale: "en-US" });
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
  await legacy.route(
    base,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Legacy fixture</title>",
      }),
    { times: 1 },
  );
  await legacy.goto(base);
  await legacy.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat", 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("conversations", { keyPath: "id" });
          open.result.createObjectStore("settings");
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["conversations", "settings"], "readwrite");
          tx.objectStore("conversations").put({
            id: "legacy",
            title: "Legacy",
            updatedAt: 1,
            draft: "old draft",
            messages: [
              {
                id: "u",
                role: "user",
                content: "Old question",
                createdAt: 1,
                status: "complete",
              },
              {
                id: "a",
                role: "assistant",
                content: "Old answer",
                createdAt: 2,
                status: "complete",
              },
              {
                id: "b",
                role: "assistant",
                content: "Old retry",
                createdAt: 3,
                status: "complete",
              },
            ],
          });
          tx.objectStore("settings").put("legacy", "activeConversation");
          tx.oncomplete = () => {
            db.close();
            resolve(undefined);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await legacy.goto(base);
  await legacy.getByText("Old retry", { exact: true }).waitFor();
  assert.equal(
    await legacy
      .getByRole("textbox", { name: "Message", exact: true })
      .inputValue(),
    "old draft",
  );
  await legacy.getByRole("button", { name: "Previous version" }).click();
  await legacy.getByText("Old answer", { exact: true }).waitFor();
  await legacy.reload();
  await legacy.getByText("Old answer", { exact: true }).waitFor();
  await legacy.close();
  console.log(
    "PASS: branching retry, editing, selection, deletion, persistence and isolated request context",
  );
} finally {
  await browser.close();
}
