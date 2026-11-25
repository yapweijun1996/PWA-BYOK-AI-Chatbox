import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { waitForSavedSettings } from "./browser-storage.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 800 },
    locale: "en-US",
  });
  let failRequest = true;
  let heldCatalog;
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith("/models")) {
      if (heldCatalog) {
        const gate = heldCatalog;
        heldCatalog = undefined;
        gate.started.resolve();
        await gate.release.promise;
      }
      return route.fulfill({
        headers,
        json: { data: [{ id: "test-model-with-a-long-name" }] },
      });
    }
    if (failRequest) {
      failRequest = false;
      return route.fulfill({ status: 503, headers, body: "{}" });
    }
    return route.fulfill({
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: 'data: {"choices":[{"delta":{"content":"Provider reply"}}]}\n\ndata: [DONE]\n\n',
    });
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Start a new chat" }).click();
  assert.equal((await page.locator(".topbar").boundingBox()).height, 50);
  assert.equal(
    await page
      .locator(".topbar-icon:visible")
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            node.getBoundingClientRect().width === 32 &&
            node.getBoundingClientRect().height === 32 &&
            node.getAttribute("aria-label") &&
            node.getAttribute("title"),
        ),
      ),
    true,
  );
  assert.equal(
    await page
      .locator(".topbar svg:visible")
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            node.getAttribute("width") === "18" &&
            node.getAttribute("height") === "18",
        ),
      ),
    true,
  );
  const enterFullscreen = page.getByRole("button", {
    name: "Enter fullscreen",
  });
  if (await enterFullscreen.count()) {
    await enterFullscreen.click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await page.getByRole("button", { name: "Exit fullscreen" }).click();
    await page.waitForFunction(() => !document.fullscreenElement);
  }
  await page.getByRole("button", { name: "IndexedDB available" }).waitFor();
  await page.getByRole("button", { name: "Change theme" }).click();
  await waitForSavedSettings(page, { theme: "light" });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "Change language" }).click();
  await waitForSavedSettings(page, { language: "en" });
  await page.getByRole("button", { name: "Change language" }).click();
  await waitForSavedSettings(page, { language: "zh-CN" });
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.getByRole("button", { name: "切换语言" }).click();
  await waitForSavedSettings(page, { language: "system" });

  await page.getByRole("button", { name: "Conversation actions" }).click();
  const actions = page.getByRole("dialog", { name: "Conversation actions" });
  await actions.getByRole("button", { name: "Rename conversation" }).click();
  await page.getByLabel("Conversation name").fill("Renamed from topbar");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page
    .locator(".topbar-title")
    .getByText("Renamed from topbar")
    .waitFor();
  await page.locator(".topbar-model").click();
  const models = page.getByRole("dialog", { name: "Choose model" });
  await models.getByRole("button", { name: "Open provider settings" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page
    .getByLabel("Model ID", { exact: true })
    .fill("test-model-with-a-long-name");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByText("This does not verify your key or chat access.", {
      exact: false,
    })
    .waitFor();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const model = page.locator(".topbar-model");
  assert.match(
    await model.getAttribute("aria-label"),
    /Model list reachable; chat not checked/,
  );
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("first");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Response failed").waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".topbar-model")
      ?.getAttribute("aria-label")
      ?.includes("Last provider request failed"),
  );
  await input.fill("second");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Provider reply").waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".topbar-model")
      ?.getAttribute("aria-label")
      ?.includes("Last provider request succeeded"),
  );
  const gate = {
    started: Promise.withResolvers(),
    release: Promise.withResolvers(),
  };
  heldCatalog = gate;
  await model.click();
  await page
    .getByRole("dialog", { name: "Choose model" })
    .getByRole("button", { name: "Open provider settings" })
    .click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await gate.started.promise;
  await page.getByRole("button", { name: "Back to chat" }).click();
  await input.fill("third");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Provider reply").nth(1).waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".topbar-model")
      ?.getAttribute("aria-label")
      ?.includes("Last provider request succeeded"),
  );
  gate.release.resolve();
  await page
    .getByText("This does not verify your key or chat access.", {
      exact: false,
    })
    .waitFor();
  assert.match(
    await model.getAttribute("aria-label"),
    /Last provider request succeeded/,
  );

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.restoreTopbarPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "settings")
        throw new DOMException("Blocked", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("button", { name: "Last local save failed" }).waitFor();
  await page.evaluate(() => window.restoreTopbarPut());
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("button", { name: "IndexedDB available" }).waitFor();

  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal((await page.locator(".topbar").boundingBox()).height, 52);
  assert.equal(
    await page
      .locator(".topbar-icon:visible")
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            node.getBoundingClientRect().width === 44 &&
            node.getBoundingClientRect().height === 44,
        ),
      ),
    true,
  );
  const title = await page.locator(".topbar-title").boundingBox();
  assert.ok(title.width >= 70);
  assert.ok(
    await page
      .locator(".top-actions")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: /Language/ }).waitFor();
  await page.getByRole("button", { name: /Theme/ }).waitFor();
  await page.getByRole("button", { name: /Theme/ }).click();
  await waitForSavedSettings(page, { theme: "system" });
  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: /Language/ }).click();
  await waitForSavedSettings(page, { language: "en" });
  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: "Workspace Inspector" }).click();
  const inspector = page.getByRole("dialog", { name: "Workspace Inspector" });
  await inspector.waitFor();
  await page.keyboard.press("Escape");
  await inspector.waitFor({ state: "hidden" });
  const profile = await mkdtemp(join(tmpdir(), "luma-topbar-standalone-"));
  try {
    const standalone = await chromium.launchPersistentContext(profile, {
      executablePath: chromePath(),
      headless: true,
      args: [`--app=${base}`],
      viewport: { width: 390, height: 750 },
      locale: "en-US",
    });
    try {
      const appPage = standalone.pages()[0] ?? (await standalone.newPage());
      if (appPage.url() === "about:blank") await appPage.goto(base);
      await appPage.locator('html[data-startup="ready"]').waitFor();
      assert.equal(
        await appPage.evaluate(
          () => matchMedia("(display-mode: standalone)").matches,
        ),
        true,
      );
      await appPage.getByRole("button", { name: "Start a new chat" }).click();
      const standaloneLayout = await appPage
        .locator(".topbar")
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: rect.left,
            right: rect.right,
            width: innerWidth,
            paddingLeft: parseFloat(style.paddingLeft),
            paddingRight: parseFloat(style.paddingRight),
          };
        });
      assert.ok(
        standaloneLayout.left >= 0 &&
          standaloneLayout.right <= standaloneLayout.width,
      );
      assert.ok(
        standaloneLayout.paddingLeft >= 8 && standaloneLayout.paddingRight >= 8,
      );
      await appPage.getByLabel("More actions").click();
      await appPage.getByRole("button", { name: /Theme/ }).waitFor();
    } finally {
      await standalone.close();
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
  console.log(
    "PASS: compact topbar, theme and language, title actions, provider and IndexedDB status, mobile and standalone menus",
  );
} finally {
  await browser.close();
}
