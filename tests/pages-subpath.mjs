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
  const faviconUrl = await page
    .locator('link[rel="icon"][type="image/svg+xml"]')
    .evaluate((link) => link.href);
  assert.equal(faviconUrl, new URL("icon.svg", url).href);
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .evaluate((link) => link.href);
  const manifestResponse = await page.request.get(manifestUrl);
  assert.ok(manifestResponse.ok());
  const manifest = await manifestResponse.json();
  const icon = manifest.icons.find(
    ({ type, sizes }) => type === "image/svg+xml" && sizes === "any",
  );
  assert.ok(icon);
  assert.equal(new URL(icon.src, manifestUrl).href, faviconUrl);
  const pngIcons = manifest.icons.filter(({ type }) => type === "image/png");
  assert.deepEqual(pngIcons.map(({ sizes }) => sizes).sort(), [
    "192x192",
    "512x512",
  ]);
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  assert.equal(scope, url);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.getByText("How can I help you today?").waitFor({ timeout: 5000 });
  await page.waitForFunction(
    (src) => {
      const logo = document.querySelector("img.brand-mark");
      return logo?.src === src && logo.complete && logo.naturalWidth > 0;
    },
    faviconUrl,
    { timeout: 5000 },
  );
  const pngSizes = await page.evaluate(
    (urls) =>
      Promise.all(
        urls.map(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return `${image.naturalWidth}x${image.naturalHeight}`;
        }),
      ),
    pngIcons.map(({ src }) => new URL(src, manifestUrl).href),
  );
  assert.deepEqual(
    pngSizes,
    pngIcons.map(({ sizes }) => sizes),
  );
  console.log(
    "PASS: GitHub Pages subpath, service-worker scope, and offline SVG and PNG icons",
  );
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
