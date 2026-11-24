import { chromePath } from "./browser-launch.mjs";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import assert from "node:assert/strict";
const root = resolve("dist");
let revision = 1;
let updateGate;
let failUpdate = false;
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const file = resolve(root, path.slice(1) || "index.html");
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let body = await readFile(file);
    if (path === "/sw.js") {
      await updateGate?.promise;
      if (failUpdate) {
        res.writeHead(503).end();
        return;
      }
      body = body
        .toString("utf8")
        .replace(
          /luma-shell-[a-f0-9]{12}/,
          (name) => `${name}-test-${revision}`,
        );
    }
    res
      .writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole("button", { name: "Start a new chat" }).click();
  const draft = page.getByRole("textbox", { name: "Message", exact: true });
  await draft.fill("Unsent work stays here");
  const appVersion = JSON.parse(await readFile("package.json", "utf8")).version;
  const check = page.getByRole("button", {
    name: `Check for updates · v${appVersion}`,
  });
  const toast = page.getByRole("status");
  const animation = () =>
    check
      .locator("svg")
      .evaluate((icon) => getComputedStyle(icon).animationName);
  updateGate = Promise.withResolvers();
  await check.click();
  await toast.getByText("Checking for updates…").waitFor();
  assert.equal(await check.getAttribute("aria-busy"), "true");
  assert.equal(await animation(), "update-spin");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await animation(), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  updateGate.resolve();
  updateGate = undefined;
  await toast.getByText("Luma Chat is up to date.").waitFor();
  assert.equal(await check.getAttribute("aria-busy"), "false");
  await page.getByRole("button", { name: "Dismiss message" }).click();
  assert.equal(await toast.textContent(), "");
  await page.context().setOffline(true);
  await check.click();
  await toast
    .getByText("You are offline. Reconnect to check for updates.")
    .waitFor();
  await page.context().setOffline(false);
  failUpdate = true;
  await check.click();
  await toast
    .getByText("Could not check for updates. Try again later.")
    .waitFor();
  failUpdate = false;
  revision = 2;
  await check.click();
  await toast.getByText("An update is ready.", { exact: false }).waitFor();
  assert.equal(await draft.inputValue(), "Unsent work stays here");
  assert.equal(
    await page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.ready).waiting),
    ),
    true,
  );
  await page.reload();
  await toast.getByText("An update is ready.", { exact: false }).waitFor();
  assert.equal(await draft.inputValue(), "Unsent work stays here");
  console.log(
    "PASS: versioned update check, shared toast, reduced motion, and waiting update without forced reload",
  );
} finally {
  updateGate?.resolve();
  await browser.close();
  await new Promise((done) => server.close(done));
}
