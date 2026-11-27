import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";

const nextChunk = Promise.withResolvers();
const finishReply = Promise.withResolvers();
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, authorization",
  );
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  for await (const _chunk of request) {
    /* Drain the request. */
  }
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  const delta = (text) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  response.write(delta("First piece"));
  await nextChunk.promise;
  if (!response.destroyed) response.write(delta(" second piece"));
  await finishReply.promise;
  if (!response.destroyed) response.end("data: [DONE]\n\n");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1100, height: 800 },
  });
  await page.addInitScript(() => {
    const original = Date.prototype.toLocaleTimeString;
    window.messageTimeFormats = 0;
    Date.prototype.toLocaleTimeString = function (...args) {
      window.messageTimeFormats++;
      return original.apply(this, args);
    };
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("luma-chat");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["conversations", "settings"], "readwrite");
          tx.objectStore("conversations").put({
            id: "long-chat",
            title: "Long conversation",
            updatedAt: Date.now(),
            draft: "",
            messages: Array.from({ length: 120 }, (_, i) => ({
              id: `long-${i}`,
              role: i % 2 ? "assistant" : "user",
              content: `Message ${i}: **stable** content.`,
              createdAt: 1700000000000 + i,
              status: "complete",
            })),
          });
          tx.objectStore("settings").put("long-chat", "activeConversation");
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
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  const messages = page.locator(".message");
  await messages.last().waitFor();
  assert.equal(await messages.count(), 120);
  await page.evaluate(() => {
    window.messageTimeFormats = 0;
  });
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("draft");
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Message"]')?.value ===
      "draft",
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const formatted = await page.evaluate(() => window.messageTimeFormats);
  console.log(
    `Long conversation: ${formatted} message time formats after draft change`,
  );
  assert.ok(formatted <= 2, `draft change rerendered ${formatted} messages`);
  assert.equal(await messages.count(), 120);
  await page
    .locator(".message.user")
    .last()
    .getByRole("button", { name: "Edit as new message" })
    .click();
  const editGuard = page.getByRole("dialog", {
    name: "Replace current draft?",
  });
  await editGuard.waitFor();
  await editGuard.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await composer.inputValue(), "draft");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await applyServerAddress(
    page,
    `http://127.0.0.1:${server.address().port}/v1`,
  );
  await page.getByLabel("Model ID").fill("long-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.getByRole("button", { name: "Send message" }).click();
  const latest = page.locator(".message.assistant").last();
  await latest.getByText("First piece", { exact: false }).waitFor();
  await page.evaluate(() => {
    window.messageTimeFormats = 0;
  });
  nextChunk.resolve();
  await latest
    .getByText("First piece second piece", { exact: false })
    .waitFor();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const streamingFormats = await page.evaluate(() => window.messageTimeFormats);
  assert.ok(
    streamingFormats <= 8,
    `streaming update rerendered ${streamingFormats} messages`,
  );
  console.log(
    `Long conversation: ${streamingFormats} message time formats during a streaming update`,
  );
  finishReply.resolve();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  assert.equal(await messages.count(), 122);
} finally {
  nextChunk.resolve();
  finishReply.resolve();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
