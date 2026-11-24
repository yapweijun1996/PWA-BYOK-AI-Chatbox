import { chromePath } from "./browser-launch.mjs";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import assert from "node:assert/strict";
const root = resolve("dist");
let revision = 1;
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
    if (path === "/sw.js")
      body = Buffer.concat([
        body,
        Buffer.from(`\n// test revision ${revision}\n`),
      ]);
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
  revision = 2;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page
    .getByText("An update is ready.", { exact: false })
    .waitFor({ timeout: 10000 });
  assert.equal(await draft.inputValue(), "Unsent work stays here");
  assert.equal(
    await page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.ready).waiting),
    ),
    true,
  );
  console.log(
    "PASS: update notification preserves draft and leaves activation to user reopening",
  );
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
