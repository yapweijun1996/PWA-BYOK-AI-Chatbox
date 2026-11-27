import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const url = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
const modulePath = /\/assets\/[^/]+\.js$/;
const stylePath = /\/assets\/[^/]+\.css$/;
const ready = (page) => page.locator('html[data-startup="ready"]').waitFor();
const hasMark = (page, name) =>
  page.waitForFunction(
    (mark) => performance.getEntriesByName(mark, "mark").length > 0,
    `luma:startup:${name}`,
  );
// Wall-clock durations include runner preemption. Observe task ordering instead.
const observeRevealTask = (page, simulatePause = false) => page.addInitScript((pause) => {
  const originalMark = performance.mark.bind(performance);
  let revealTaskEnded = false;
  window.testRevealTask = { sawReveal: false, readyInSameTask: null };
  performance.mark = (name, options) => {
    const mark = originalMark(name, options);
    if (name === "luma:startup:attempt-1:reveal") {
      window.testRevealTask.sawReveal = true;
      revealTaskEnded = false;
      queueMicrotask(() => { revealTaskEnded = true; });
      // Emulate a slow CI runner between marks without creating an asynchronous boundary.
      if (pause) {
        const deadline = performance.now() + 50;
        while (performance.now() < deadline) { /* simulate preemption */ }
      }
    } else if (name === "luma:startup:attempt-1:ready") {
      window.testRevealTask.readyInSameTask = window.testRevealTask.sawReveal && !revealTaskEnded;
    }
    return mark;
  };
}, simulatePause);
const setUp = { locale: "en-US", serviceWorkers: "block" };
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});

try {
  const cold = await browser.newPage({
    ...setUp,
    colorScheme: "dark",
    reducedMotion: "reduce",
    viewport: { width: 320, height: 568 },
  });
  await observeRevealTask(cold, true);
  const scripts = Promise.withResolvers();
  const styles = Promise.withResolvers();
  const errors = [];
  const backgroundTasks = [];
  cold.on("pageerror", (error) => errors.push(error.message));
  cold.on("request", (request) => {
    if (
      request.url().endsWith("/sw.js") ||
      new URL(request.url()).origin !== new URL(url).origin
    )
      backgroundTasks.push(request.url());
  });
  await cold.route(modulePath, async (route) => {
    await scripts.promise;
    await route.continue();
  });
  await cold.route(stylePath, async (route) => {
    await styles.promise;
    await route.continue();
  });
  try {
    await cold.goto(url, { waitUntil: "commit" });
    const splash = cold.locator("#startup-splash");
    await splash.getByRole("heading", { name: "Luma Chat" }).waitFor();
    await cold.waitForFunction(
      () => performance.getEntriesByName("first-contentful-paint").length > 0,
    );
    assert.equal(
      await cold.locator("html").getAttribute("data-startup"),
      "loading",
    );
    assert.equal(await cold.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(
      await splash.evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(23, 24, 27)",
    );
    assert.equal(
      await splash.evaluate((el) => getComputedStyle(el).transitionProperty),
      "none",
    );
    assert.deepEqual(await splash.boundingBox(), {
      x: 0,
      y: 0,
      width: 320,
      height: 568,
    });
    assert.equal(await cold.locator(".app").count(), 0);
    scripts.resolve();
    await hasMark(cold, "attempt-1:state-restored");
    assert.equal(
      await cold.locator("html").getAttribute("data-startup"),
      "restoring",
    );
    assert.equal(await cold.locator(".app").count(), 0);
    assert.equal(
      await cold.locator("#root").getAttribute("aria-hidden"),
      "true",
    );
    assert.deepEqual(backgroundTasks, []);
    styles.resolve();
    await ready(cold);
    assert.equal(await splash.count(), 0);
    assert.equal(await cold.locator("#root").getAttribute("inert"), null);
    assert.equal(
      await cold
        .getByRole("textbox", { name: "Message", exact: true })
        .isDisabled(),
      true,
    );
    const stats = await cold.evaluate(async () => {
      const timeline = (name) =>
        performance.getEntriesByName(`luma:startup:attempt-1:${name}`)[0]
          .startTime;
      const shifts = await new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          observer.disconnect();
          resolve(
            list
              .getEntries()
              .filter((entry) => !entry.hadRecentInput)
              .reduce((sum, entry) => sum + entry.value, 0),
          );
        });
        observer.observe({ type: "layout-shift", buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 50);
      });
      const database = (await indexedDB.databases()).find(
        ({ name }) => name === "luma-chat",
      );
      return {
        fcp: performance.getEntriesByName("first-contentful-paint")[0]
          .startTime,
        entry: performance.getEntriesByName("luma:startup:entry")[0].startTime,
        interactive: performance.getEntriesByName("luma:startup:interactive")[0]
          .duration,
        stages: [
          "restore-start",
          "database-open",
          "state-restored",
          "styles-ready",
          "mount-start",
          "mounted",
          "verified",
          "reveal",
          "ready",
        ].map(timeline),
        reducedReveal: window.testRevealTask,
        fade: performance.getEntriesByName("luma:startup:attempt-1:splash-fade")[0].duration,
        tokenColor: getComputedStyle(document.body)
          .getPropertyValue("--color-bg")
          .trim(),
        appColor: getComputedStyle(document.body).backgroundColor,
        version: database?.version,
        shifts,
      };
    });
    assert.ok(stats.fcp <= stats.entry && stats.entry <= stats.interactive);
    assert.deepEqual(
      stats.stages,
      [...stats.stages].sort((a, b) => a - b),
    );
    assert.equal(stats.tokenColor, "#17181b");
    assert.equal(stats.appColor, "rgb(23, 24, 27)");
    assert.equal(stats.version, 2);
    assert.equal(stats.shifts, 0);
    assert.deepEqual(stats.reducedReveal, { sawReveal: true, readyInSameTask: true });
    assert.ok(stats.fade >= 30, "the simulated slow runner must exercise the old threshold");
    assert.deepEqual(errors, []);
    console.log(
      `Startup timing with gated assets: FCP ${Math.round(stats.fcp)} ms, interactive ${Math.round(stats.interactive)} ms, layout shift ${stats.shifts}`,
    );
  } finally {
    scripts.resolve();
    styles.resolve();
    await cold.close();
  }

  const cached = await browser.newPage({
    locale: "en-US",
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
  });
  await observeRevealTask(cached);
  await cached.addInitScript(() => {
    window.addEventListener("luma:startup:entry", () => {
      window.testEntryTheme = document.documentElement.dataset.theme;
    });
    const register = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = function (...args) {
      performance.mark(
        `test:worker:${document.documentElement.dataset.startup}`,
      );
      return register.apply(this, args);
    };
  });
  await cached.goto(url);
  await ready(cached);
  // Complete the initial install and claim before navigating. Reloading while
  // activation is in progress can leave the next document uncontrolled if
  // clients.claim() runs in the gap between the two documents.
  await cached.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await cached.evaluate(async () => {
    const request = indexedDB.open("luma-chat");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["settings", "conversations"], "readwrite");
      tx.objectStore("settings").put(
        {
          theme: "light",
          provider: "lmstudio",
          providers: { lmstudio: { model: "local-restored-model" } },
        },
        "settings",
      );
      const chats = tx.objectStore("conversations");
      chats.put({
        id: "latest",
        title: "Newest conversation",
        updatedAt: 2,
        draft: "Most recent draft",
        messages: [],
      });
      chats.put({
        id: "other",
        title: "Older conversation",
        updatedAt: 1,
        draft: "Older\r\nunsent draft",
        messages: [],
        draftAttachments: [
          {
            id: "notes",
            name: "notes.txt",
            mime: "text/plain",
            data: "notes",
            size: 5,
          },
        ],
      });
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await cached.reload();
  await ready(cached);
  assert.equal(
    await cached.locator("html").getAttribute("data-theme"),
    "light",
  );
  assert.equal(await cached.evaluate(() => window.testEntryTheme), "dark");
  assert.equal(
    await cached.evaluate(() => {
      const colors = getComputedStyle(document.body);
      return (
        colors.getPropertyValue("--color-bg").trim() ===
        colors.getPropertyValue("--startup-bg").trim()
      );
    }),
    true,
  );
  assert.equal(
    await cached.evaluate(() => localStorage.getItem("luma:theme")),
    "light",
  );
  assert.equal(
    await cached.locator(".topbar > strong").innerText(),
    "Newest conversation",
  );
  await cached
    .getByRole("button", { name: "Older conversation", exact: true })
    .click();
  await cached
    .getByRole("separator", { name: "Resize sidebar" })
    .press("ArrowRight");
  await cached.getByRole("button", { name: "Settings", exact: true }).click();
  await cached.getByRole("button", { name: "Appearance", exact: true }).click();
  await cached.getByLabel("Theme", { exact: true }).selectOption("dark");
  await cached.waitForFunction(
    () => localStorage.getItem("luma:theme") === "dark",
  );
  await cached.getByRole("button", { name: "Back to chat" }).click();
  await cached.waitForFunction(() =>
    Boolean(navigator.serviceWorker.controller),
  );
  await cached.waitForFunction(
    () => performance.getEntriesByName("test:worker:ready").length > 0,
  );
  assert.ok(
    await cached.evaluate(
      () =>
        performance.getEntriesByName("test:worker:ready")[0].startTime >=
        performance.getEntriesByName("luma:startup:interactive")[0].duration,
    ),
  );
  await cached.emulateMedia({ colorScheme: "light" });
  await cached.context().setOffline(true);
  await cached.reload();
  await ready(cached);
  assert.equal(await cached.evaluate(() => window.testEntryTheme), "dark");
  assert.equal(await cached.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(
    await cached.locator("meta[name=theme-color]").getAttribute("content"),
    "#17181b",
  );
  assert.equal(
    await cached.locator(".topbar > strong").innerText(),
    "Older conversation",
  );
  assert.equal(
    (await cached.locator("#chat-sidebar").boundingBox()).width,
    280,
  );
  assert.match(
    await cached.locator(".composer .model-pill").getAttribute("title"),
    /local-restored-model/,
  );
  assert.equal(
    await cached
      .getByRole("textbox", { name: "Message", exact: true })
      .inputValue(),
    "Older\nunsent draft",
  );
  await cached.getByText("notes.txt", { exact: true }).waitFor();
  assert.ok(
    await cached.evaluate(
      () =>
        performance.getEntriesByName("luma:startup:attempt-1:splash-fade")[0]
          .duration > 0,
    ),
  );
  assert.deepEqual(await cached.evaluate(() => window.testRevealTask), {
    sawReveal: true,
    readyInSameTask: false,
  });
  await cached.close();

  const delayed = await browser.newPage(setUp);
  await delayed.addInitScript(() => {
    const original = indexedDB.open;
    const pending = {};
    indexedDB.open = () => pending;
    window.blockTestStorageOnce = () => {
      indexedDB.open = () => {
        const blocked = {};
        indexedDB.open = original;
        queueMicrotask(() => blocked.onblocked());
        return blocked;
      };
    };
    window.lateDatabaseOpen = () => {
      pending.result = {
        close: () => {
          window.lateDatabaseClosed = true;
        },
      };
      pending.onsuccess();
    };
  });
  await delayed.goto(url);
  await hasMark(delayed, "attempt-1:restore-start");
  await delayed
    .locator('html[data-startup="failed"][data-startup-error="timeout"]')
    .waitFor({ state: "attached", timeout: 18_000 });
  await delayed
    .getByRole("alert")
    .filter({ hasText: "Startup took too long." })
    .waitFor();
  assert.equal(await delayed.locator(".app").count(), 0);
  await delayed.evaluate(() => {
    window.blockTestStorageOnce();
    window.lateDatabaseOpen();
  });
  assert.ok(await delayed.evaluate(() => window.lateDatabaseClosed));
  const retryStorage = delayed.getByRole("button", {
    name: "Retry",
    exact: true,
  });
  await retryStorage.click();
  await delayed
    .locator('html[data-startup="failed"][data-startup-error="blocked"]')
    .waitFor({ state: "attached" });
  await delayed
    .getByRole("alert")
    .filter({ hasText: "blocked by another window" })
    .waitFor();
  await retryStorage.click();
  await ready(delayed);
  await hasMark(delayed, "attempt-3:ready");
  assert.equal(
    await delayed.evaluate(
      () => performance.getEntriesByName("luma:startup:interactive").length,
    ),
    1,
  );
  await delayed.close();

  const broken = await browser.newPage(setUp);
  const rejectModule = (route) => route.abort();
  await broken.route(modulePath, rejectModule);
  await broken.goto(url);
  await broken
    .locator('html[data-startup="entry-failed"]')
    .waitFor({ state: "attached" });
  await broken
    .getByRole("alert")
    .filter({ hasText: "Could not load the app files." })
    .waitFor();
  await broken.unroute(modulePath, rejectModule);
  const rejectStyles = (route) => route.abort();
  await broken.route(stylePath, rejectStyles);
  await broken.getByRole("button", { name: "Retry", exact: true }).click();
  await broken
    .locator('html[data-startup="failed"][data-startup-error="assets"]')
    .waitFor({ state: "attached" });
  assert.equal(await broken.locator(".app").count(), 0);
  await broken.unroute(stylePath, rejectStyles);
  const incompleteStyles = (route) =>
    route.fulfill({
      contentType: "text/css",
      body: "/* Deliberately missing the layout contract. */",
    });
  await broken.route(stylePath, incompleteStyles);
  await broken.getByRole("button", { name: "Reload app", exact: true }).click();
  await broken
    .locator('html[data-startup="failed"][data-startup-error="ui"]')
    .waitFor({ state: "attached" });
  assert.equal(await broken.locator(".app").count(), 0);
  assert.equal(
    await broken.locator("#root").getAttribute("aria-hidden"),
    "true",
  );
  await broken.unroute(stylePath, incompleteStyles);
  await broken.getByRole("button", { name: "Reload app", exact: true }).click();
  await ready(broken);
  await broken.close();

  const noScript = await browser.newPage({
    ...setUp,
    javaScriptEnabled: false,
  });
  await noScript.goto(url);
  await noScript.getByRole("heading", { name: "Luma Chat" }).waitFor();
  const instructions = noScript.locator("#startup-splash noscript p");
  await instructions.waitFor();
  assert.equal(
    await instructions.innerText(),
    "Enable JavaScript and reload to open Luma Chat.",
  );
  assert.equal(await noScript.locator("#startup-status").isVisible(), false);
  await noScript.close();

  console.log(
    "PASS: static themed first paint, IndexedDB readiness, deferred worker, offline restoration, reduced motion, timings, and startup fault recovery",
  );
} finally {
  await browser.close();
}
