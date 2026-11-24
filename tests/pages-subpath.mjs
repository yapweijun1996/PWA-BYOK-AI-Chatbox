import { chromePath } from "./browser-launch.mjs";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import assert from "node:assert/strict";
const root = resolve("dist");
const prefix = "/PWA-BYOK-AI-Chatbox/";
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
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(root, pathname.slice(prefix.length) || "index.html");
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen),
);
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}${prefix}`;
  await page.goto(url);
  await page.getByText("How can I help you today?").waitFor();
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  assert.equal(scope, url);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.getByText("How can I help you today?").waitFor({ timeout: 5000 });
  console.log(
    "PASS: GitHub Pages subpath, service-worker scope, and offline reload",
  );
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
