import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";
import { holdConversationWrite } from "./browser-storage.mjs";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { exerciseAtomicImport } from "./backup-import.mjs";
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  let failedOnce = false;
  const routerBodies = [];
  let routerRejectedOnce = false;
  let localChatRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };
    if (request.url().endsWith("/models"))
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ data: [{ id: "local-test" }] }),
      });
    const body = JSON.parse(request.postData());
    localChatRequests++;
    assert.equal(body.model, "local-test");
    if (
      !failedOnce &&
      body.messages.some((message) => message.content === "Retry this")
    ) {
      failedOnce = true;
      return route.fulfill({ status: 503, headers, body: "{}" });
    }
    return route.fulfill({
      status: 200,
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: 'data: {"choices":[{"delta":{"content":"Hello from local model"}}]}\n\ndata: [DONE]\n\n',
    });
  });
  await page.route("https://openrouter.ai/api/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (request.url().endsWith("/models"))
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          data: [
            {
              id: "thinkingmachines/inkling-2-mini",
              pricing: { prompt: "0.00002", completion: "0.00003" },
            },
          ],
        }),
      });
    const body = JSON.parse(request.postData());
    routerBodies.push(body);
    assert.equal(body.model, "thinkingmachines/inkling-2-mini");
    const prompt = body.messages.at(-1).content;
    if (prompt === "Router test" && !routerRejectedOnce) {
      routerRejectedOnce = true;
      return route.fulfill({ status: 401, headers, body: "{}" });
    }
    const reportsCost = prompt === "Router test";
    const content = prompt === "Fresh cloud message" ? "Fresh cloud reply" : reportsCost
      ? 'OpenRouter answer\n\n<img src=x onerror="window.testXss=1">'
      : "Answer with catalog estimate";
    const usage = {
      prompt_tokens: 90,
      completion_tokens: 10,
      total_tokens: 100,
      ...(reportsCost ? { cost: 0.0012 } : {}),
    };
    const events = [{ choices: [{ delta: { content } }] }, { choices: [], usage }];
    return route.fulfill({
      status: 200,
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n",
    });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio" }).click();
  await page.getByLabel("Model ID").fill("local-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByPlaceholder("Enter key for this session").fill("dummy-for-first-base");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  const checkCatalogAuth = async (base, expected) => {
    const seen = page.waitForRequest(r => r.method() === "GET" && r.url() === `${base}/models`);
    await page.getByRole("button", { name: "Test connection" }).click();
    assert.equal(await (await seen).headerValue("authorization"), expected);
  };
  await checkCatalogAuth("http://localhost:1234/v1", "Bearer dummy-for-first-base");
  await page.getByRole("button", { name: "Edit server address" }).click();
  const editor = page.getByRole("dialog", { name: "Edit server address" });
  await editor.getByLabel("Server base URL").fill("http://localhost:1234/v1?token=dummy-only");
  await editor.getByRole("button", { name: "Apply address" }).click();
  await editor.getByRole("alert").waitFor();
  const storedAddress = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("luma-chat");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("settings");
      const read = tx.objectStore("settings").get("settings");
      tx.oncomplete = () => { db.close(); resolve(read.result?.providers?.lmstudio?.endpoint); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  assert.equal(storedAddress, "http://localhost:1234/v1");
  await editor.getByLabel("Server base URL").fill("http://localhost:1234/v1/other");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await checkCatalogAuth("http://localhost:1234/v1", "Bearer dummy-for-first-base");
  await applyServerAddress(page, "http://localhost:1234/v1/other");
  await checkCatalogAuth("http://localhost:1234/v1/other", null);
  await applyServerAddress(page, "http://localhost:1234/v1");
  await checkCatalogAuth("http://localhost:1234/v1", null);
  await page
    .getByRole("status")
    .getByText("Model list loaded", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "draft.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("attachment contents"),
  });
  await page.getByText("draft.txt", { exact: false }).waitFor();
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("luma-chat");
        req.onsuccess = () => {
          const query = req.result
            .transaction("conversations")
            .objectStore("conversations")
            .getAll();
          query.onsuccess = () =>
            resolve(
              query.result.some((chat) =>
                chat.draftAttachments?.some((a) => a.name === "draft.txt"),
              ),
            );
        };
      }),
  );
  await page.reload();
  await page.getByText("draft.txt", { exact: false }).waitFor();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Hello there");
  const finalMatch = { title: "Hello there", status: "complete" };
  const finalWrite = await holdConversationWrite(page, finalMatch);
  await page.getByRole("button", { name: "Send message" }).click();
  const firstReply = page.locator(".message.assistant").first();
  await finalWrite.held();
  await firstReply.getByText("Hello from local model").waitFor();
  await firstReply.getByText("Saving reply locally…").waitFor();
  assert.equal(await firstReply.getByText("Saved locally", { exact: true }).count(), 0);
  await finalWrite.release("abort");
  await firstReply.getByText("Reply not saved locally.").waitFor();
  const localRetry = await holdConversationWrite(page, finalMatch);
  await firstReply.getByRole("button", { name: "Retry local save" }).click();
  await localRetry.held();
  await firstReply.getByText("Saving reply locally…").waitFor();
  await localRetry.release("commit");
  await firstReply.getByText("Saved locally", { exact: true }).waitFor();
  assert.equal(localChatRequests, 1);
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (value?.messages?.some((m) => m.content === "Save failure"))
        throw new DOMException("Storage full", "QuotaExceededError");
      return window.originalPut.call(this, value, ...args);
    };
  });
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Save failure");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByText("Message was not sent because local storage failed.", {
      exact: false,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .inputValue(),
    "Save failure",
  );
  assert.equal(localChatRequests, 1);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalPut;
    delete window.originalPut;
  });
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByText("Hello from local model").waitFor();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Retry this");
  const errorWrite = await holdConversationWrite(page, { title: "Hello there", status: "error" });
  await page.getByRole("button", { name: "Send message" }).click();
  await errorWrite.held();
  await page.getByText("Response failed").waitFor();
  assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
  await errorWrite.release("commit");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Hello from local model").nth(1).waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "OpenRouter", exact: true }).click();
  await page.getByLabel("Model ID").fill("thinkingmachines/inkling-2-mini");
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByText("This does not verify your key or chat access.", {
      exact: false,
    })
    .waitFor();
  await page
    .getByPlaceholder("Enter key for this session")
    .fill("mock-router-key");
  await page.getByRole("button", { name: "Use key" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const send = page.getByRole("button", { name: "Send message" });
  const beforeBrowseSend = localChatRequests;
  await input.fill("Still using LM Studio");
  await send.click();
  await page.getByText("Hello from local model", { exact: true }).nth(2).waitFor();
  assert.equal(localChatRequests, beforeBrowseSend + 1);
  assert.equal(routerBodies.length, 0);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "OpenRouter", exact: true }).click();
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await input.fill("Router test");
  const share = page.getByRole("dialog", { name: "Share chat history?" });
  await send.click();
  await share.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await input.inputValue(), "Router test");
  assert.equal(routerBodies.length, 0);

  await send.click();
  await share.getByRole("button", { name: "Start an empty chat" }).click();
  await page.getByText("How can I help you today?").waitFor();
  assert.equal(await input.inputValue(), "");
  assert.equal(routerBodies.length, 0);
  await input.fill("Fresh cloud message");
  await send.click();
  await page.getByText("Fresh cloud reply", { exact: true }).waitFor();
  assert.deepEqual(routerBodies[0].messages, [{ role: "user", content: "Fresh cloud message" }]);

  const original = page.locator(".history").getByRole("button", { name: "Hello there", exact: true });
  await original.click();
  await original.and(page.locator('[aria-current="page"]')).waitFor();
  assert.equal(await input.inputValue(), "Router test");
  await send.click();
  await share.getByRole("button", { name: "Send with history" }).click();
  await page
    .getByText("Authentication failed (HTTP 401).", { exact: false })
    .waitFor();
  assert.equal(routerBodies.length, 2);
  assert.ok(routerBodies[1].messages.some(({ content }) => content.includes("attachment contents")));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("OpenRouter answer").waitFor();
  const response = page.locator(".message.assistant").filter({ hasText: "OpenRouter answer" });
  await response.locator("summary").click();
  await response.getByText("$0.0012", { exact: true }).last().waitFor();
  const cost = response.locator("dl > div").filter({ hasText: "API cost (USD)" });
  assert.equal(await cost.locator("dd").first().innerText(), "$0.0012");
  assert.ok(await cost.getByText("Provider reported").isVisible());
  assert.equal(await page.evaluate(() => window.testXss), undefined);
  assert.equal(
    await page.locator('section[aria-label="Conversation"] img').count(),
    0,
  );
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Estimate a reply");
  await page.getByRole("button", { name: "Send message" }).click();
  const estimated = page.locator(".message.assistant").filter({ hasText: "Answer with catalog estimate" });
  const estimateFooter = estimated.locator("summary");
  await estimateFooter.getByText("≈$0.0021", { exact: true }).waitFor();
  await estimateFooter.click();
  await estimated.getByText("Catalog estimate", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  await page
    .getByPlaceholder("Enter key for this session")
    .fill("mock-test-key");
  await page.getByLabel("Save encrypted on this device").check();
  await page.getByLabel("Unlock password").fill("test password");
  await page.getByRole("button", { name: "Use key" }).click();
  await page.getByText("Key encrypted and unlocked on this device.").waitFor();
  const stored = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("luma-chat");
        req.onsuccess = () => {
          const r = req.result
            .transaction("settings")
            .objectStore("settings")
            .get("settings");
          r.onsuccess = () => resolve(JSON.stringify(r.result));
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  assert.ok(!stored.includes("mock-test-key"));
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.getByLabel("Unlock password").fill("wrong password");
  await page.getByRole("button", { name: "Unlock saved key" }).click();
  await page.getByText("Could not unlock key.", { exact: false }).waitFor();
  await page.getByLabel("Unlock password").fill("test password");
  await page.getByRole("button", { name: "Unlock saved key" }).click();
  await page.getByText("Key unlocked for this session.").waitFor();
  await page.getByRole("button", { name: "Local data" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const content = await (await download.createReadStream()).toArray();
  const json = Buffer.concat(content).toString("utf8");
  assert.ok(json.includes("Hello from local model"));
  const exportedReply = JSON.parse(json).conversations.flatMap((chat) => chat.messages).find((message) => message.telemetry?.cost?.source === "reported");
  assert.deepEqual(exportedReply?.telemetry.cost, { usd: 0.0012, source: "reported" });
  assert.ok(!json.includes("vaults"));
  assert.ok(!json.includes("cloudHistoryRecipient"));
  assert.ok(!json.includes("localRevision"));
  assert.ok(!json.includes("mock-test-key"));
  await page.locator('input[accept="application/json,.json"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page.getByRole("heading", { name: "Import preview" }).waitFor();
  assert.equal(await page.getByLabel("Also import appearance and provider settings").isChecked(), false);
  await page.getByRole("button", { name: "Import and skip conflicts" }).click();
  await page.getByText("Imported 0 conversations.").waitFor();
  await exerciseAtomicImport(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByText("Hello from local model")
    .first()
    .waitFor({ timeout: 5000 });
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await mobilePage.getByRole("button", { name: "Open menu" }).click();
  await mobilePage
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await mobilePage.getByRole("heading", { name: "AI providers" }).waitFor();
  assert.equal(
    await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    "PASS: mocked LM Studio model discovery and streaming, history persistence, backup, offline shell, mobile navigation and viewport",
  );
  await mobile.close();
  await context.close();
} finally {
  await browser.close();
}
