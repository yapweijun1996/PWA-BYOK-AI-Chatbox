import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { onlyShellCache } from "./shell-cache.mjs";
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
  String.raw`Inline \(\frac{1}{2}\) formula.`,
  "",
  String.raw`\[ (1+1+1)! \times \frac{1}{1} = 6 \]`,
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
const userText = "First line\nSecond **bold** line\nThird line\n\nLast paragraph";
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
      if (imageRequests === 1) return route.abort("failed");
      await route.fulfill({ body: pixel, contentType: "image/png" });
    },
  );
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await applyServerAddress(
    page,
    `http://127.0.0.1:${server.address().port}/v1`,
  );
  await page.getByLabel("Model ID").fill("render-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(userText);
  await page.getByRole("button", { name: "Send message" }).click();
  const userMessage = page.locator(".message.user").last();
  await userMessage.locator(".rich-message p br").first().waitFor({ state: "attached" });
  assert.equal(await userMessage.locator(".rich-message p br").count(), 2);
  assert.equal(await userMessage.locator(".rich-message strong").innerText(), "bold");
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
  // Simulate a downward scroll event arriving after content growth but before
  // ResizeObserver has followed the new tail. This must not disable follow.
  await pane.evaluate((el) => {
    const content = el.querySelector(".messages");
    const spacer = document.createElement("div");
    spacer.dataset.testScrollSpacer = "true";
    spacer.style.height = "300px";
    content.append(spacer);
    el.scrollTop += 20;
    el.dispatchEvent(new Event("scroll"));
  });
  await atBottom();
  await pane.evaluate((el) => {
    el.querySelector("[data-test-scroll-spacer]").remove();
  });
  await atBottom();
  // Layout can also report an upward correction without any user input.
  await pane.evaluate((el) => {
    const spacer = document.createElement("div");
    spacer.dataset.testScrollSpacer = "true";
    spacer.style.height = "300px";
    el.querySelector(".messages").append(spacer);
    el.scrollTop -= 20;
    el.dispatchEvent(new Event("scroll"));
    el.scrollTop -= 20;
    el.dispatchEvent(new Event("scroll"));
  });
  await atBottom();
  await pane.evaluate((el) => { el.querySelector("[data-test-scroll-spacer]").remove(); });
  await atBottom();
  const readingPosition = await pane.evaluate(async (el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -36, bubbles: true }));
    el.scrollTop = el.scrollHeight - el.clientHeight - 36;
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    return el.scrollTop;
  });
  assert.ok(readingPosition > 0);
  const jump = page.getByRole("button", { name: "Jump to latest" });
  await jump.waitFor();
  firstClose.resolve();
  const copy = reply.getByRole("button", { name: "Copy code" });
  await copy.waitFor();
  assert.match(await tail.innerText(), /\\frac/);
  assert.equal(await reply.locator(".katex-display").count(), 0);
  assert.equal(await pane.evaluate((el) => el.scrollTop), readingPosition);
  await copy.evaluate((el) => {
    el.dataset.preserved = "yes";
  });
  await jump.click();
  await atBottom();
  await jump.waitFor({ state: "detached" });
  assert.equal(await pane.evaluate((el) => document.activeElement === el), true);
  finish.resolve();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  await reply.locator(".katex-display").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".message.assistant .katex-mathml math").length === 4);
  assert.equal(await reply.locator(".katex-display").count(), 2);
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
  const paneBox = await pane.boundingBox();
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  await page.mouse.wheel(0, -180);
  await jump.waitFor();
  await jump.click();
  await atBottom();
  await copy.click();
  await page.getByText("Code copied.").waitFor();
  assert.equal(await page.evaluate(() => window.testClipboard), code);
  await reply.getByRole("button", { name: "Copy", exact: true }).click();
  assert.equal(await page.evaluate(() => window.testClipboard), source);
  const wrap = reply.getByRole("button", { name: "Wrap", exact: true });
  const codeScroll = reply.locator(".rich-code pre");
  assert.equal(await wrap.getAttribute("aria-pressed"), "false");
  await wrap.click();
  assert.equal(await wrap.getAttribute("aria-pressed"), "true");
  assert.equal(await codeScroll.evaluate((el) => getComputedStyle(el.querySelector("code")).whiteSpace), "pre-wrap");
  await page.waitForFunction(() => {
    const el = document.querySelector(".rich-code pre");
    return el.scrollWidth <= el.clientWidth + 1 && !el.parentElement.querySelector(".rich-scroll-hint");
  });
  await page.evaluate(() => { window.testClipboard = "not copied yet"; });
  await copy.click();
  assert.equal(await page.evaluate(() => window.testClipboard), code);
  await wrap.click();
  assert.equal(imageRequests, 0);
  await reply
    .getByRole("button", { name: "Load image: Example chart" })
    .click();
  await reply.getByText("Image unavailable.").waitFor();
  assert.equal(imageRequests, 1);
  await reply.locator(".rich-image-box").getByRole("button", { name: "Retry" }).click();
  await reply.getByRole("img", { name: "Example chart" }).waitFor();
  await reply.locator('.rich-image-box[data-state="loaded"]').waitFor();
  const imageSize = await reply.getByRole("img", { name: "Example chart" }).boundingBox();
  assert.ok(Math.abs(imageSize.width - imageSize.height) < 1);
  assert.equal(imageRequests, 2);
  assert.deepEqual(failures, []);

  await page.setViewportSize({ width: 320, height: 675 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".sidebar")).visibility === "hidden");
  await pane.evaluate((el) => { el.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true })); el.scrollTop = 0; });
  await jump.waitFor();
  const jumpBounds = await jump.boundingBox();
  const paneBounds = await pane.boundingBox();
  assert.ok(jumpBounds.width >= 44 && jumpBounds.height >= 44 && jumpBounds.x >= 0 && jumpBounds.x + jumpBounds.width <= 320 && jumpBounds.y >= paneBounds.y && jumpBounds.y + jumpBounds.height <= paneBounds.y + paneBounds.height);
  await pane.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await jump.waitFor({ state: "detached" });
  await pane.evaluate((el) => { el.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true })); el.scrollTop = 0; });
  await jump.waitFor();
  await jump.click();
  await atBottom();
  await jump.waitFor({ state: "detached" });
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
  assert.equal(await reply.locator(".rich-scroll-hint").count(), 2);
  const table = reply.getByRole("region", { name: /Message table/ });
  assert.match(await table.getAttribute("aria-label"), /Scroll horizontally/);
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector(".rich-table").scrollLeft > 0);

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
  await userMessage.getByRole("button", { name: "Copy", exact: true }).click();
  assert.equal(await page.evaluate(() => window.testClipboard), userText);
  await userMessage.getByRole("button", { name: "Edit as new message" }).click();
  assert.equal(await page.getByRole("textbox", { name: "Message", exact: true }).inputValue(), userText);
  await page.getByRole("button", { name: "Cancel edit" }).click();
  await page.context().setOffline(true);
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  assert.equal(await userMessage.locator(".rich-message p br").count(), 2);
  await reply.locator(".katex-display").first().waitFor();
  assert.ok(
    await page.evaluate(
      async (name) => {
        const fonts = await document.fonts.load('16px "KaTeX_Main"', "1+2");
        const cache = await caches.open(name);
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
      },
      await onlyShellCache(page),
    ),
  );
  assert.equal(await reply.getByRole("table").count(), 1);
  assert.equal(imageRequests, 2);
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
