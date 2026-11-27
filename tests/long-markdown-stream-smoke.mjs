import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";

const startChunks = Promise.withResolvers();
const chunksDone = Promise.withResolvers();
const finish = Promise.withResolvers();
const initial = "Long answer: " + "content ".repeat(1500);
const chunks = Array.from(
  { length: 24 },
  (_, i) => ` chunk-${String(i).padStart(2, "0")}`,
);
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  for await (const _chunk of req) {
    /* Drain the request. */
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  const delta = (content) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
  res.write(delta(initial));
  await startChunks.promise;
  for (const chunk of chunks) {
    if (res.destroyed) break;
    res.write(delta(chunk));
    await delay(18);
  }
  chunksDone.resolve();
  await finish.promise;
  if (!res.destroyed) res.end(delta(" terminal-chunk") + "data: [DONE]\n\n");
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
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await applyServerAddress(
    page,
    `http://127.0.0.1:${server.address().port}/v1`,
  );
  await page.getByLabel("Model ID").fill("markdown-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Give a long reply");
  await page.getByRole("button", { name: "Send message" }).click();
  const reply = page.locator(".message.assistant").last();
  await reply.locator(".rich-stream-tail").waitFor();
  await page.evaluate(() => {
    const root = document.querySelector(
      ".message.assistant:last-child .message-answer .rich-message",
    );
    window.longMarkdownMutations = 0;
    window.longMarkdownObserver = new MutationObserver(() => {
      window.longMarkdownMutations++;
    });
    window.longMarkdownObserver.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  startChunks.resolve();
  await chunksDone.promise;
  await page.waitForFunction(() =>
    document
      .querySelector(".message.assistant:last-child .rich-stream-tail")
      ?.textContent?.includes("chunk-23"),
  );
  const mutations = await page.evaluate(() => {
    window.longMarkdownObserver.disconnect();
    return window.longMarkdownMutations;
  });
  console.log(
    `Long Markdown: ${mutations} DOM update batches for ${chunks.length} rapid chunks`,
  );
  assert.ok(
    mutations < chunks.length,
    `rapid chunks were not coalesced: ${mutations} updates`,
  );
  finish.resolve();
  await reply.getByText("Saved locally", { exact: true }).waitFor();
  assert.ok(
    (await reply.locator(".message-answer").textContent()).endsWith(
      chunks.join("") + " terminal-chunk",
    ),
  );
  const saved = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("luma-chat");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("conversations")
            .objectStore("conversations")
            .getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result[0].messages.at(-1).content);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
  assert.equal(
    saved === initial + chunks.join("") + " terminal-chunk",
    true,
    "stored Markdown must retain every chunk",
  );
} finally {
  startChunks.resolve();
  finish.resolve();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
