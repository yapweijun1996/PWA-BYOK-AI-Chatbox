import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const replyGate = Promise.withResolvers();
try {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1100, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("luma-chat");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(["conversations", "settings"], "readwrite");
          const messages = Array.from({ length: 400 }, (_, i) => ({
            id: `virtual-${i}`,
            role: i % 2 ? "assistant" : "user",
            content:
              `Virtual message ${i}. ` + (i === 0 ? "Search target unique. " : "") + "Plain text ".repeat(1 + (i % 20)),
            createdAt: 1700000000000 + i,
            status: "complete",
          }));
          tx.objectStore("conversations").put({
            id: "virtual-chat",
            title: "Virtual test",
            updatedAt: Date.now(),
            draft: "",
            messages,
          });
          tx.objectStore("conversations").put({
            id: "rich-chat",
            title: "Rich test",
            updatedAt: 1,
            draft: "",
            messages: messages.map((message, i) => ({
              ...message,
              id: `rich-${i}`,
              content:
                i === 397
                  ? "```html\n<h1>Interactive</h1>\n```"
                  : message.content,
              attachments: i === 398 ? [{ id: "file", name: "notes.txt", mime: "text/plain", size: 4, data: "test" }] : undefined,
              toolExecutions: i === 399 ? [{ id: "tool", name: "text_tool", code: "input", startedAt: 1700000000000, result: { status: "success", durationMs: 1, console: [], value: { text: "done" } } }] : undefined,
            })),
          });
          tx.objectStore("settings").put("virtual-chat", "activeConversation");
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
  const pane = page.locator(".conversation"),
    list = page.locator(".messages"),
    rows = list.locator(".message");
  assert.equal(await rows.count(), 400);
  const enable = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Experimental long conversation mode" })
      .check();
    await page.getByRole("button", { name: "Back to chat" }).click();
    await page.waitForFunction(
      () => document.querySelector(".messages")?.dataset.virtualized === "true",
    );
  };
  await enable();
  assert.ok(
    (await rows.count()) < 100,
    "only a window of rows should be mounted",
  );
  await page.getByText("Virtual message 399.", { exact: false }).waitFor();
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.waitForFunction(
    () => document.querySelector(".messages")?.dataset.virtualized === "true",
  );
  assert.ok(
    (await rows.count()) < 100,
    "reload should mount only the virtual window",
  );
  await page.getByText("Virtual message 399.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Show full conversation" }).click();
  await page.waitForFunction(() => {
    const pane = document.querySelector(".conversation");
    return pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 2;
  });
  assert.equal(
    await rows.count(),
    400,
    "full mode should restore all rows at the bottom",
  );
  await enable();
  const other = await page.context().newPage();
  await other.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await other.locator('html[data-startup="ready"]').waitFor();
  assert.equal(
    await other.locator(".messages").getAttribute("data-virtualized"),
    "false",
    "another tab must default to full mode",
  );
  assert.equal(await other.locator(".message").count(), 400);
  await other.close();
  await pane.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true }));
    el.scrollTop = 0;
  });
  await page.getByText("Virtual message 0.", { exact: false }).waitFor();
  assert.ok((await rows.count()) < 100);
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await page.getByText("Virtual message 399.", { exact: false }).waitFor();
  assert.equal(await list.getAttribute("data-virtualized"), "true");
  await pane.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true }));
    el.scrollTop = el.scrollHeight / 2;
  });
  await page.waitForFunction(() => {
    const el = document.querySelector(".conversation");
    const rows = document.querySelectorAll(".messages > [data-message-id]");
    return (
      rows.length &&
      [...rows].some(
        (row) =>
          row.getBoundingClientRect().top >= el.getBoundingClientRect().top &&
          row.getBoundingClientRect().bottom <=
            el.getBoundingClientRect().bottom,
      )
    );
  });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const previousScroll = await pane.evaluate((el) => el.scrollTop);
  await pane.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true }));
    el.scrollTop -= 60;
  });
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".conversation").scrollTop <= previous - 50,
    previousScroll,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.ok(
    await pane.evaluate(
      (el, previous) => el.scrollTop <= previous - 50,
      previousScroll,
    ),
    "window updates must not undo user scrolling",
  );
  const before = await pane.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const rows = [...el.querySelectorAll(".messages > [data-message-id]")];
    const first = rows.find((row) => row.getBoundingClientRect().bottom > top);
    const above = rows.find(
      (row) => row.getBoundingClientRect().bottom < top - 5,
    );
    if (!first || !above)
      throw new Error("expected an overscanned row above viewport");
    const result = {
      id: first.dataset.messageId,
      offset: first.getBoundingClientRect().top - top,
    };
    above.style.minHeight = `${above.getBoundingClientRect().height + 120}px`;
    return result;
  });
  await page.waitForFunction(
    ({ id, offset }) => {
      const pane = document.querySelector(".conversation");
      const row = [...pane.querySelectorAll("[data-message-id]")].find(
        (item) => item.dataset.messageId === id,
      );
      return (
        row &&
        Math.abs(
          row.getBoundingClientRect().top -
            pane.getBoundingClientRect().top -
            offset,
        ) < 4
      );
    },
    before,
    { timeout: 3000 },
  );
  const after = await pane.evaluate((el, id) => {
    const row = [...el.querySelectorAll("[data-message-id]")].find(
      (item) => item.dataset.messageId === id,
    );
    return (
      row && row.getBoundingClientRect().top - el.getBoundingClientRect().top
    );
  }, before.id);
  assert.ok(
    after !== null && Math.abs(after - before.offset) < 4,
    `reading anchor moved: ${before.offset} to ${after}`,
  );
  await page.setViewportSize({ width: 900, height: 800 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForFunction(
    ({ id, offset }) => {
      const pane = document.querySelector(".conversation");
      const row = [...pane.querySelectorAll("[data-message-id]")].find(
        (item) => item.dataset.messageId === id,
      );
      return (
        row &&
        Math.abs(
          row.getBoundingClientRect().top -
            pane.getBoundingClientRect().top -
            offset,
        ) < 8
      );
    },
    before,
    { timeout: 6000 },
  );
  await page.evaluate(() =>
    document.fonts.dispatchEvent(new Event("loadingdone")),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForFunction(
    ({ id, offset }) => {
      const pane = document.querySelector(".conversation");
      const row = [...pane.querySelectorAll("[data-message-id]")].find(
        (item) => item.dataset.messageId === id,
      );
      return (
        row &&
        Math.abs(
          row.getBoundingClientRect().top -
            pane.getBoundingClientRect().top -
            offset,
        ) < 8
      );
    },
    before,
    { timeout: 6000 },
  );
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".sidebar")).visibility ===
      "hidden",
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForFunction(
    ({ id, offset }) => {
      const pane = document.querySelector(".conversation");
      const row = [...pane.querySelectorAll("[data-message-id]")].find(
        (item) => item.dataset.messageId === id,
      );
      return (
        row &&
        Math.abs(
          row.getBoundingClientRect().top -
            pane.getBoundingClientRect().top -
            offset,
        ) < 8
      );
    },
    before,
    { timeout: 6000 },
  );
  await page.setViewportSize({ width: 900, height: 800 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForFunction(
    ({ id, offset }) => {
      const pane = document.querySelector(".conversation");
      const row = [...pane.querySelectorAll("[data-message-id]")].find(
        (item) => item.dataset.messageId === id,
      );
      return (
        row &&
        Math.abs(
          row.getBoundingClientRect().top -
            pane.getBoundingClientRect().top -
            offset,
        ) < 8
      );
    },
    before,
    { timeout: 6000 },
  );
  await page.getByRole("button", { name: "Show full conversation" }).click();
  assert.equal(await rows.count(), 400);
  const restored = await pane.evaluate((el, id) => {
    const row = [...el.querySelectorAll("[data-message-id]")].find(
      (item) => item.dataset.messageId === id,
    );
    return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
  }, before.id);
  assert.ok(
    Math.abs(restored - before.offset) < 4,
    `full mode moved the reading anchor: ${before.offset} to ${restored}`,
  );
  await enable();
  await page.getByRole("button", { name: "Rich test", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".messages")?.dataset.virtualized === "true",
  );
  assert.ok((await rows.count()) < 100, "rich content should remain virtualized");
  await page.getByText("notes.txt", { exact: false }).waitFor();
  await list.locator('[data-message-id="rich-397"]').getByRole("button", { name: "Preview", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "false");
  await list.locator('[data-message-id="rich-397"] iframe').waitFor();
  await pane.evaluate((el) => { el.scrollTop = 0; });
  assert.equal(await list.locator('[data-message-id="rich-397"] iframe').count(), 1, "open preview remains mounted while reading elsewhere");
  await page.getByRole("button", { name: "Resume virtual mode (closes open previews)" }).click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "true");
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await list.locator(".tool-execution > summary").click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "false");
  assert.equal(await list.locator(".tool-execution").getAttribute("open"), "");
  await page.getByRole("button", { name: "Resume virtual mode (closes open previews)" }).click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "true");
  await page.getByRole("button", { name: "Virtual test", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".messages")?.dataset.virtualized === "true" && document.querySelector('[data-message-id="virtual-399"]'),
  );
  await rows.last().getByRole("button", { name: "Copy", exact: true }).focus();
  await page.waitForFunction(
    () => document.querySelector(".messages")?.dataset.virtualized === "false",
  );
  assert.equal(
    await rows.count(),
    400,
    "focusing a message must restore full mode",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.activeElement?.closest("[data-message-id]")?.dataset.messageId,
    ),
    "virtual-399",
  );
  await page.getByRole("button", { name: "Resume virtual mode (closes open previews)" }).click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "true");
  await page.evaluate(() => {
    const text = document.querySelector(
      ".messages .message-answer p",
    ).firstChild;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(7, text.length));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForFunction(
    () => document.querySelector(".messages")?.dataset.virtualized === "false",
  );
  assert.equal(
    await rows.count(),
    400,
    "text selection must restore full mode",
  );
  assert.ok(
    (await page.evaluate(() => getSelection().toString())).length > 0,
    "selection should remain available after restoring full mode",
  );
  const copied = await page.evaluate(() => {
    const rows = document.querySelectorAll(".messages > [data-message-id]");
    const range = document.createRange();
    range.setStartBefore(rows[0]);
    range.setEndAfter(rows[rows.length - 1]);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const clipboard = new DataTransfer();
    document.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
    selection.removeAllRanges();
    return clipboard.getData("text/plain");
  });
  assert.match(copied, /Virtual message 0\./);
  assert.match(copied, /Virtual message 399\./);
  await page.getByRole("button", { name: "Resume virtual mode (closes open previews)" }).click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "true");
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    await replyGate.promise;
    return route.fulfill({
      status: 200,
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: `data: ${JSON.stringify({ choices: [{ delta: { content: "Virtual reply" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID").fill("virtual-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.waitForFunction(
    () => document.querySelector(".messages")?.dataset.virtualized === "true",
  );
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Continue");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".messages")?.dataset.virtualized === "false" &&
      !sessionStorage.getItem("luma:virtual-experiment"),
  );
  assert.ok(
    (await rows.count()) >= 400,
    "starting a reply must restore full mode",
  );
  replyGate.resolve();
  await page.getByText("Virtual reply", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  await enable();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.virtualCopied = text; } } }));
  await page.getByRole("button", { name: "Copy conversation", exact: true }).click();
  const copiedConversation = await page.evaluate(() => window.virtualCopied);
  assert.match(copiedConversation, /Virtual message 0\./);
  assert.match(copiedConversation, /Virtual message 399\./);
  assert.match(copiedConversation, /Virtual reply/);
  assert.equal(await list.getAttribute("data-virtualized"), "true");
  await page.getByRole("button", { name: "Search conversations" }).click();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "false");
  const search = page.getByRole("dialog", { name: "Search conversations" });
  await search.getByRole("searchbox", { name: "Search conversations" }).fill("Search target unique");
  await search.getByRole("button", { name: /Message match.*Search target unique/ }).first().click();
  await page.waitForFunction(() => document.activeElement?.dataset.messageId === "virtual-0");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("luma:virtual-experiment")), "1");
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "true", null, { timeout: 12000 });
  assert.ok(await page.locator('[data-message-id="virtual-0"]').isVisible());
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.waitForFunction(() => document.querySelector(".messages")?.dataset.virtualized === "true");
  console.log(
    "PASS: opt-in virtual window, measured heights, anchor restoration, search fallback and full-mode default",
  );
} finally {
  replyGate.resolve();
  await browser.close();
}
