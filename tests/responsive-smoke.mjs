import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
      locale: "en-US",
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
            const db = request.result;
            const tx = db.transaction(
              ["conversations", "settings"],
              "readwrite",
            );
            tx.objectStore("conversations").put({
              id: "responsive-chat",
              title:
                "A very long conversation title that must never clip the header controls",
              updatedAt: Date.now(),
              draft: "",
              messages: [
                {
                  id: "user",
                  role: "user",
                  content: "A long prompt ".repeat(80),
                  createdAt: Date.now(),
                  status: "complete",
                },
                {
                  id: "answer",
                  role: "assistant",
                  content: "A long response ".repeat(100),
                  reasoning: "Private reasoning details",
                  createdAt: Date.now(),
                  status: "complete",
                },
                {
                  id: "failed",
                  role: "assistant",
                  content: "",
                  error: "Provider returned HTTP 503.",
                  createdAt: Date.now(),
                  status: "error",
                },
              ],
            });
            tx.objectStore("settings").put(
              "responsive-chat",
              "activeConversation",
            );
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
    await page
      .locator(".response-error")
      .getByText("Provider returned HTTP 503.")
      .waitFor();
    assert.equal(
      await page.locator(".reasoning").evaluate((node) => node.open),
      false,
    );
    const layout = await page.evaluate(() => {
      const selectors = [
        ".topbar",
        ".top-actions",
        ".top-actions .model-pill",
        ".inspector-control",
        ".update-control",
        ".composer",
        ".composer-actions",
        ".composer-actions .model-pill",
        ".send",
        ".messages",
        ".bubble",
      ];
      return selectors.map((selector) => {
        const el = document.querySelector(selector);
        const rect = el.getBoundingClientRect();
        return {
          selector,
          left: rect.left,
          right: rect.right,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      });
    });
    for (const item of layout) {
      assert.ok(
        item.left >= -1 && item.right <= width + 1,
        `${width}: ${JSON.stringify(item)}`,
      );
      if (
        [
          ".topbar",
          ".top-actions",
          ".composer",
          ".composer-actions",
          ".messages",
          ".bubble",
        ].includes(item.selector)
      )
        assert.ok(
          item.scrollWidth <= item.clientWidth + 1,
          `${width}: ${JSON.stringify(item)}`,
        );
    }
    const conversation = page.locator(".conversation");
    assert.ok(
      await conversation.evaluate((el) => el.scrollHeight > el.clientHeight),
    );
    await conversation.evaluate((el) => {
      el.scrollTop = 0;
    });
    assert.equal(await conversation.evaluate((el) => el.scrollTop), 0);
    await conversation.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    assert.ok(await conversation.evaluate((el) => el.scrollTop > 0));
    await page.locator(".reasoning summary").click();
    await page.getByText("Private reasoning details").waitFor();

    assert.ok(
      await page
        .getByRole("button", { name: "Retry", exact: true })
        .isVisible(),
    );
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    if (mobile) assert.ok((await retry.boundingBox()).height >= 44);
    await retry.click();
    const retryDialog = page.getByRole("dialog", { name: "Retry reply?" });
    const bounds = await retryDialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.keyboard.press("Escape");
    await retryDialog.waitFor({ state: "hidden" });
    assert.equal(
      await retry.evaluate((element) => document.activeElement === element),
      true,
    );
    await context.close();
  }
  console.log(
    "PASS: desktop, tablet and mobile controls, long messages, scrolling, failure details and collapsed reasoning",
  );
} finally {
  await browser.close();
}
