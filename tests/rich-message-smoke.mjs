import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";

const firstClose = Promise.withResolvers();
const finish = Promise.withResolvers();
const code = `const answer = 42; // ${"very-long-code-".repeat(16)}`;
const first = `# Stable heading\n\n${Array.from({ length: 22 }, (_, i) => `Background paragraph ${i + 1}.`).join("\n\n")}\n\n\`\`\`javascript\n${code}`;
const next = "\n```\n\n$$\n\\frac{1}{2}";
const final = [
  "\n$$\n",
  "Inline math $x^2$ and **final emphasis**.",
  "",
  "- [x] Done",
  "- [ ] Open",
  "",
  "| Label | Value |",
  "| --- | --- |",
  `| ${"A wide cell ".repeat(15)} | 7 |`,
  "",
  "![Example chart](https://images.example.invalid/chart.png)",
].join("\n");
const source = first + next + final;
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url !== "/v1/chat/completions") return res.writeHead(404).end();
  for await (const _chunk of req) {
    /* Drain the mocked request. */
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  const delta = (content) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
  res.write(delta(first));
  await firstClose.promise;
  if (res.destroyed) return;
  res.write(delta(next));
  await finish.promise;
  if (!res.destroyed) res.end(delta(final) + "data: [DONE]\n\n");
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
    viewport: { width: 1100, height: 730 },
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.testClipboard = text;
        },
      },
    }),
  );
  let imageRequests = 0;
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWlQAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route(
    "https://images.example.invalid/chart.png",
    async (route) => {
      imageRequests++;
      assert.equal(route.request().headers().referer, undefined);
      await route.fulfill({ body: pixel, contentType: "image/png" });
    },
  );
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await applyServerAddress(page, `http://127.0.0.1:${server.address().port}/v1`);
  await page.getByLabel("Model ID").fill("render-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Render a **rich** reply");
  await page.getByRole("button", { name: "Send message" }).click();
  const reply = page.locator(".message.assistant");
  const pane = page.locator(".conversation");
  const tail = reply.locator(".rich-stream-tail");
  const atBottom = () =>
    page.waitForFunction(() => {
      const el = document.querySelector(".conversation");
      return el && el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
    });
  await reply.getByRole("heading", { name: "Stable heading" }).waitFor();
  await tail.waitFor();
  assert.match(await tail.innerText(), /```javascript/);
  assert.equal(
    await reply.getByRole("button", { name: "Copy code" }).count(),
    0,
  );
  await atBottom();
  const readingPosition = await pane.evaluate(async (el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight - 36;
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    return el.scrollTop;
  });
  assert.ok(readingPosition > 0);
  firstClose.resolve();
  const copy = reply.getByRole("button", { name: "Copy code" });
  await copy.waitFor();
  assert.match(await tail.innerText(), /\\frac/);
  assert.equal(await reply.locator(".katex-display").count(), 0);
  assert.equal(await pane.evaluate((el) => el.scrollTop), readingPosition);
  await copy.evaluate((el) => {
    el.dataset.preserved = "yes";
  });
  await pane.evaluate(async (el) => {
    el.scrollTop = el.scrollHeight;
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  });
  await atBottom();
  finish.resolve();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  await reply.locator(".katex-display").waitFor();
  assert.equal(await reply.locator(".katex-mathml math").count(), 2);
  assert.equal(await reply.locator(".rich-stream-tail").count(), 0);
  assert.equal(await copy.getAttribute("data-preserved"), "yes");
  assert.equal(await reply.getByRole("table").count(), 1);
  assert.equal(await reply.getByRole("checkbox").first().isDisabled(), true);
  assert.equal(await reply.getByRole("checkbox").first().isChecked(), true);
  assert.equal(
    await reply.locator(".rich-code-header > span").innerText(),
    "JavaScript",
  );
  assert.equal(
    await reply.locator(".hljs-keyword").first().innerText(),
    "const",
  );
  await atBottom();
  await copy.click();
  await page.getByText("Code copied.").waitFor();
  assert.equal(await page.evaluate(() => window.testClipboard), code);
  assert.equal(imageRequests, 0);
  await reply
    .getByRole("button", { name: "Load image: Example chart" })
    .click();
  await reply.getByRole("img", { name: "Example chart" }).waitFor();
  assert.equal(imageRequests, 1);
  assert.deepEqual(failures, []);

  await page.setViewportSize({ width: 320, height: 675 });
  await page.emulateMedia({ colorScheme: "dark" });
  const widths = await pane.evaluate((el) => ({
    page: document.documentElement.scrollWidth,
    pane: el.scrollWidth,
    paneWidth: el.clientWidth,
    nested: [...el.querySelectorAll(".rich-scroll")].map(
      (node) => node.scrollWidth > node.clientWidth,
    ),
  }));
  assert.equal(widths.page, 320);
  assert.equal(widths.pane, widths.paneWidth);
  assert.deepEqual(widths.nested, [true, true]);

  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const saved = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("luma-chat");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve) => {
      const req = db
        .transaction("conversations")
        .objectStore("conversations")
        .getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result[0].messages.at(-1).content);
      };
    });
  });
  assert.equal(saved, source);
  await page.context().setOffline(true);
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  await reply.locator(".katex-display").waitFor();
  assert.ok(
    await page.evaluate(async () => {
      const fonts = await document.fonts.load('16px "KaTeX_Main"', "1+2");
      const cacheKeys = await caches.keys();
      const cache = await caches.open(
        cacheKeys.find((key) => key.startsWith("luma-shell-")),
      );
      const cachedFonts = (await cache.keys()).filter((request) =>
        request.url.endsWith(".woff2"),
      );
      return (
        fonts.length > 0 &&
        fonts.every((font) => font.status === "loaded") &&
        cachedFonts.length > 0 &&
        performance
          .getEntriesByType("resource")
          .some(
            (entry) =>
              /KaTeX.*\.woff2$/.test(entry.name) &&
              new URL(entry.name).origin === location.origin,
          )
      );
    }),
  );
  assert.equal(await reply.getByRole("table").count(), 1);
  assert.equal(imageRequests, 1);
  assert.deepEqual(failures, []);
  console.log(
    "PASS: streamed Markdown and math, stable code DOM and scroll intent, raw IndexedDB source, opt-in images, 320px overflow, offline KaTeX fonts",
  );
} finally {
  firstClose.resolve();
  finish.resolve();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
