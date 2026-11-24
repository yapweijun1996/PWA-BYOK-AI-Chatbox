import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
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
  await page.goto("http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio" }).click();
  await page.getByLabel("Model ID").fill("local-test");
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByRole("status")
    .getByText("Connected.", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Hello there");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Hello from local model").waitFor();
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
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles({
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
  await mobilePage.goto("http://127.0.0.1:55167/");
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
