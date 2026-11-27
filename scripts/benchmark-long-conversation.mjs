import { chromium } from "playwright-core";
import { chromePath } from "../tests/browser-launch.mjs";

const counts = (process.env.MESSAGE_COUNTS || "250,500,1000,2000")
  .split(",")
  .map(Number);
const repetitions = Number(process.env.REPETITIONS || 3);
const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.locator('html[data-startup="ready"]').waitFor();
  console.log(
    JSON.stringify({
      chromium: browser.version(),
      viewport: "1280x800",
      cache: "warm browser shell; service worker blocked",
      repetitions,
    }),
  );
  for (const count of counts) {
    await page.evaluate(
      (count) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("luma-chat");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(
              ["conversations", "settings"],
              "readwrite",
            );
            tx.objectStore("conversations").put({
              id: "benchmark",
              title: "Long conversation benchmark",
              updatedAt: 1,
              draft: "",
              messages: Array.from({ length: count }, (_, i) => ({
                id: `m-${i}`,
                role: i % 2 ? "assistant" : "user",
                content: `Message ${i}: **bold** and a [link](https://example.com).\n\nA second paragraph with $x^2$.`,
                createdAt: 1700000000000 + i,
                status: "complete",
              })),
            });
            tx.objectStore("settings").put("benchmark", "activeConversation");
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
      count,
    );
    const samples = [];
    for (let iteration = 0; iteration < repetitions; iteration++) {
      await page.reload({ waitUntil: "commit" });
      await page
        .locator('html[data-startup="ready"]')
        .waitFor({ timeout: 90000 });
      await page
        .locator(".message")
        .last()
        .waitFor({ state: "attached", timeout: 90000 });
      const stats = await page.evaluate(() => ({
        interactiveMs: Math.round(
          performance.getEntriesByName("luma:startup:interactive")[0].duration,
        ),
        observedMs: Math.round(performance.now()),
        messages: document.querySelectorAll(".message").length,
        domNodes: document.querySelectorAll(".messages *").length,
      }));
      if (stats.messages !== count)
        throw new Error(`Expected ${count} messages, got ${stats.messages}`);
      samples.push(stats);
    }
    console.log(JSON.stringify({ count, samples }));
  }
  await context.close();
} finally {
  await browser.close();
}
