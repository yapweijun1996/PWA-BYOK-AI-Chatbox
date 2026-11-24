import { chromePath } from "./browser-launch.mjs";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
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
  let routerFailed = false;
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
          data: [{ id: "thinkingmachines/inkling-2-mini" }],
        }),
      });
    assert.equal(
      JSON.parse(request.postData()).model,
      "thinkingmachines/inkling-2-mini",
    );
    if (!routerFailed) {
      routerFailed = true;
      return route.fulfill({ status: 401, headers, body: "{}" });
    }
    return route.fulfill({
      status: 200,
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'OpenRouter answer\n\n<img src=x onerror="window.testXss=1">' } }] })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio" }).click();
  await page.getByLabel("Model ID").fill("local-test");
  await page.getByRole("button", { name: "Test connection" }).click();
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
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Hello from local model").waitFor();
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
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Response failed").waitFor();
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
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Router test");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByText("Authentication failed (HTTP 401).", { exact: false })
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("OpenRouter answer").waitFor();
  assert.equal(await page.evaluate(() => window.testXss), undefined);
  assert.equal(
    await page.locator('section[aria-label="Conversation"] img').count(),
    0,
  );
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
  assert.ok(!json.includes("vaults"));
  assert.ok(!json.includes("mock-test-key"));
  await page.locator('input[accept="application/json,.json"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page.getByRole("heading", { name: "Import preview" }).waitFor();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Import and skip conflicts" }).click();
  await page.getByText("Imported 0 conversations.").waitFor();
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
