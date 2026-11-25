import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { waitForSavedConversation } from "./browser-storage.mjs";
import { applyServerAddress } from "./provider-settings.mjs";
import { onlyShellCache, shellCaches } from "./shell-cache.mjs";
import { updateFixtures } from "./update-fixtures.mjs";

const fixtures = await updateFixtures();
let live = "A";
let worker = "A";
let updateGate;
let failUpdate = false;
let assetFault;
const finishReply = Promise.withResolvers();
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    if (req.method === "POST" && pathname === "/mock/v1/chat/completions") {
      for await (const _ of req) {
        /* Drain the mocked provider request. */
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(
        'data: {"choices":[{"delta":{"content":"Mock reply in progress"}}]}\n\n',
      );
      await finishReply.promise;
      if (!res.destroyed) res.end("data: [DONE]\n\n");
      return;
    }
    const match = /^\/(chat|sibling)\/(.*)$/.exec(pathname);
    if (!match) return res.writeHead(404).end();
    const primary = match[1] === "chat";
    const key = `./${match[2]}`;
    const script = key === "./sw.js";
    const release = primary ? (script ? worker : live) : "A";
    if (primary && script) {
      await updateGate?.promise;
      if (failUpdate) return res.writeHead(503).end();
    }
    let body = fixtures[release].get(key);
    if (body === undefined) return res.writeHead(404).end();
    if (primary && key === fixtures.css && assetFault) {
      const fault = assetFault;
      fault.requested = true;
      await fault.gate.promise;
      if (fault.disconnect) return res.destroy();
      body = ":root { --update-fixture: wrong; }"; // HTTP 200, but not B's bytes.
    }
    res
      .writeHead(200, {
        "Content-Type": types[key === "./" ? ".html" : extname(key)],
        "Cache-Control": "no-store",
      })
      .end(body);
  } catch {
    if (!res.destroyed) res.destroy();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/chat/`;
const other = `${origin}/sibling/`;
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const ready = (page) => page.locator('html[data-startup="ready"]').waitFor();
const button = (page, name) => page.getByRole("button", { name, exact: true });
const composer = (page) =>
  page.getByRole("textbox", { name: "Message", exact: true });
async function assertRelease(page, expected) {
  await ready(page);
  const markers = await page.evaluate(() => [
    document.querySelector('meta[name="update-fixture"]')?.content ?? "A",
    document.documentElement.dataset.fixtureJs ?? "A",
    getComputedStyle(document.documentElement)
      .getPropertyValue("--update-fixture")
      .trim() || "A",
    getComputedStyle(document.querySelector(".main")).display,
  ]);
  assert.deepEqual(markers, [expected, expected, expected, "flex"]);
}
try {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();
  await assertRelease(page, "A");
  const old = await onlyShellCache(page, url);
  const sibling = await context.newPage();
  await sibling.goto(other);
  await sibling.waitForFunction(() =>
    Boolean(navigator.serviceWorker.controller),
  );
  const siblingCache = await onlyShellCache(sibling, other);
  assert.notEqual(siblingCache, old);
  // A legacy cache with the same URL must be neither served nor deleted.
  const legacy = "luma-shell-legacy-fixture";
  await sibling.evaluate(
    async ([name, url]) => {
      const cache = await caches.open(name);
      await cache.put(
        url,
        new Response("not this release", {
          headers: { "Content-Type": "text/html" },
        }),
      );
    },
    [legacy, url],
  );

  await button(page, "Start a new chat").click();
  const draft = composer(page);
  const unsent = "Unsent work stays here";
  await draft.fill(unsent);
  await waitForSavedConversation(page, { draft: unsent });
  const appVersion = JSON.parse(await readFile("package.json", "utf8")).version;
  const workerVersion = await page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.ready).active;
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(
        () => reject(new Error("Worker version timed out")),
        5000,
      );
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(data.version);
      };
      worker.postMessage({ type: "LUMA_GET_VERSION" }, [channel.port2]);
    });
  });
  assert.equal(workerVersion, appVersion);
  const check = button(page, `Check for updates · v${appVersion}`);
  assert.equal(await check.getAttribute("data-update-state"), "idle");
  const toast = page.locator(".toast").getByRole("status");
  const animation = () =>
    check
      .locator("svg")
      .evaluate((icon) => getComputedStyle(icon).animationName);
  updateGate = Promise.withResolvers();
  await check.click();
  await toast.getByText("Checking for updates…").waitFor();
  assert.equal(await check.getAttribute("data-update-state"), "checking");
  assert.equal(
    await page.locator(".update-state-label").innerText(),
    "Checking",
  );
  assert.equal(await check.getAttribute("aria-busy"), "true");
  assert.equal(await animation(), "update-spin");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await animation(), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  updateGate.resolve();
  updateGate = undefined;
  await toast.getByText("Luma Chat is up to date.").waitFor();
  assert.equal(await check.getAttribute("data-update-state"), "current");
  assert.equal(
    await page.locator(".update-state-label").innerText(),
    "Up to date",
  );
  assert.equal(await check.getAttribute("aria-busy"), "false");
  await button(page, "Dismiss message").click();
  assert.equal(await toast.textContent(), "");
  await context.setOffline(true);
  await check.click();
  await toast
    .getByText("You are offline. Reconnect to check for updates.")
    .waitFor();
  assert.equal(await check.getAttribute("data-update-state"), "offline");
  assert.equal(
    await page.locator(".update-state-label").innerText(),
    "Offline",
  );
  await context.setOffline(false);
  failUpdate = true;
  await check.click();
  const failed = toast.getByText(
    "Could not check for updates. Try again later.",
  );
  await failed.waitFor();
  assert.equal(await check.getAttribute("data-update-state"), "failed");
  assert.equal(
    await page.locator(".update-state-label").innerText(),
    "Update failed",
  );
  failUpdate = false;

  live = worker = "B";
  for (const disconnect of [false, true]) {
    assetFault = {
      disconnect,
      gate: Promise.withResolvers(),
      requested: false,
    };
    await check.click();
    await toast.getByText("Checking for updates…").waitFor();
    await assertAssetRequested(() => assetFault.requested);
    if (disconnect) await context.setOffline(true);
    assetFault.gate.resolve();
    await failed.waitFor();
    assetFault = undefined;
    assert.deepEqual(await shellCaches(page, url), [old]);
    assert.equal(
      await page.evaluate(
        async () => !!(await navigator.serviceWorker.ready).waiting,
      ),
      false,
    );
  }
  // Offline mid-install, then online with B's HTML already live. Neither
  // navigation may replace A's shell or point it at B-only assets.
  await page.reload();
  await assertRelease(page, "A");
  assert.equal(await draft.inputValue(), unsent);
  worker = "A";
  await context.setOffline(false);
  await page.goto(`${url}index.html?reopen=1`);
  await assertRelease(page, "A");
  assert.equal(await draft.inputValue(), unsent);

  const keeper = await context.newPage();
  await keeper.goto(url);
  await assertRelease(keeper, "A");
  await button(page, "Settings").click();
  await button(page, "LM Studio").click();
  await applyServerAddress(page, `${origin}/mock/v1`);
  await page.getByLabel("Model ID", { exact: true }).fill("mock-update-model");
  await button(page, "Set as default provider").click();
  await button(page, "Back to chat").click();
  await draft.fill("Hold this mocked reply");
  await button(page, "Send message").click();
  await page.getByText("Mock reply in progress", { exact: true }).waitFor();
  await draft.fill(unsent);
  await waitForSavedConversation(page, {
    title: "Hold this mocked reply",
    draft: unsent,
  });
  const documentId = await page.evaluate(
    () => (window.updateDocument = crypto.randomUUID()),
  );
  worker = "B";
  await check.click();
  await toast
    .getByText(
      "Update paused. Finish the current task and save your work, then try again.",
    )
    .waitFor();
  assert.equal(await check.getAttribute("data-update-state"), "available");
  await page.getByText("v0.2.1 · Update available", { exact: true }).waitFor();
  assert.match(await check.getAttribute("title"), /v0\.2\.1/);
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 1101, height: 800 });
  assert.equal(
    await page
      .locator(".top-actions")
      .evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth &&
          element.getBoundingClientRect().right <= innerWidth,
      ),
    true,
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByLabel("More actions").click();
  await page
    .locator(".topbar-menu")
    .getByText("An update is ready · v0.2.1", { exact: true })
    .waitFor();
  await page.getByLabel("More actions").click();
  await page.setViewportSize(originalViewport);
  const legacyViewer = await context.newPage();
  await legacyViewer.addInitScript(() => {
    const postMessage = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function (message, ...args) {
      if (message?.type === "LUMA_GET_VERSION") return;
      return postMessage.call(this, message, ...args);
    };
  });
  await legacyViewer.goto(url);
  await assertRelease(legacyViewer, "A");
  const legacyCheck = button(
    legacyViewer,
    `Check for updates · v${appVersion}`,
  );
  await legacyViewer.waitForFunction(
    () =>
      document
        .querySelector(".update-control")
        ?.getAttribute("data-update-state") === "available",
  );
  await legacyViewer.waitForTimeout(1300);
  assert.match(await legacyCheck.getAttribute("title"), /An update is ready/);
  assert.doesNotMatch(await legacyCheck.getAttribute("title"), /v0\.2\.1/);
  await legacyViewer.close();
  assert.equal(await page.evaluate(() => window.updateDocument), documentId);
  assert.equal(await button(page, "Stop generating").isVisible(), true);
  assert.equal(await draft.inputValue(), unsent);
  assert.equal(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.ready).waiting,
    ),
    true,
  );
  finishReply.resolve();
  await page.getByText("Saved locally", { exact: true }).waitFor();
  await check.click();
  await toast
    .getByText(
      "Update paused. Close other Luma Chat tabs and windows, then try again.",
    )
    .waitFor();
  assert.equal(await draft.inputValue(), unsent);
  await keeper.close();
  await page.evaluate(() => {
    const original = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function (message, ...args) {
      if (message?.type === "LUMA_ACTIVATE_UPDATE") {
        setTimeout(() => original.call(this, message, ...args), 300);
      } else original.call(this, message, ...args);
    };
  });
  await check.click();
  await page.getByText("Installing update…").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('meta[name="update-fixture"]')?.content === "B",
  );
  await assertRelease(page, "B");
  assert.equal(await composer(page).inputValue(), unsent);
  await page.getByText("Mock reply in progress", { exact: true }).waitFor();
  const activationDeadline = Date.now() + 10_000;
  let installed;
  do {
    installed = await shellCaches(sibling, url);
    if (installed.length === 1 && installed[0] !== old) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < activationDeadline);
  assert.equal(installed.length, 1, "Expected old build cache to be removed");
  assert.notEqual(installed[0], old);
  assert.equal(await onlyShellCache(sibling, other), siblingCache);
  assert.equal(
    await sibling.evaluate((name) => caches.has(name), legacy),
    true,
  );
  await sibling.reload();
  await assertRelease(sibling, "A");
  console.log(
    "PASS: update controls, interrupted install, active-reply and multi-window protection, automatic activation, preserved draft and scope isolation",
  );
} finally {
  updateGate?.resolve();
  assetFault?.gate.resolve();
  finishReply.resolve();
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}

async function assertAssetRequested(requested) {
  const deadline = Date.now() + 10000;
  while (!requested() && Date.now() < deadline)
    await new Promise((done) => setTimeout(done, 20));
  assert.ok(
    requested(),
    "B must be installing its new stylesheet before interrupting it",
  );
}
