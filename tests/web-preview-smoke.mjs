import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const content = [
  '```html', '<!doctype html><html><body><h1 id="title">Hello</h1><script>document.querySelector("#title").textContent="Rendered HTML";try{parent.document.body.dataset.compromised="yes"}catch(e){document.body.dataset.isolated="yes"}fetch("https://preview-network.invalid/probe").catch(()=>{});</script></body></html>', '```', '',
  '```svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="15" fill="red"/></svg>', '```', '',
  '```css', 'h1 { color: rgb(255, 0, 0); }', '```', '',
  '```javascript', 'console.log("JS works", 42);', '```', '',
  '```python', 'print("no preview")', '```',
].join('\n');
const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 390, height: 844 } });
  let externalRequests = 0;
  await page.route("https://preview-network.invalid/**", async route => { externalRequests++; await route.abort(); });
  await page.route("http://localhost:1234/v1/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers: { ...headers, "Content-Type": "text/event-stream" }, body: `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID").fill("preview-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Create examples");
  await page.getByRole("button", { name: "Send message" }).click();
  const reply = page.locator(".message.assistant").last();
  await reply.getByText("Saved locally", { exact: true }).waitFor();
  const blocks = reply.locator(".rich-code");
  assert.equal(await blocks.count(), 5);
  assert.equal(await blocks.nth(4).getByRole("button", { name: "Preview", exact: true }).count(), 0);
  assert.equal(await reply.locator("iframe").count(), 0);
  for (let i = 0; i < 4; i++) await blocks.nth(i).getByRole("button", { name: "Preview", exact: true }).click();
  const html = blocks.nth(0).frameLocator("iframe");
  await html.locator("#title").getByText("Rendered HTML").waitFor();
  assert.equal(await html.locator("body").getAttribute("data-isolated"), "yes");
  assert.equal(await page.locator("body").getAttribute("data-compromised"), null);
  assert.equal(await blocks.nth(0).locator("iframe").getAttribute("sandbox"), "allow-scripts");
  await blocks.nth(1).frameLocator("iframe").locator("svg circle").waitFor();
  const css = blocks.nth(2).frameLocator("iframe");
  assert.equal(await css.locator("h1").evaluate(el => getComputedStyle(el).color), "rgb(255, 0, 0)");
  await blocks.nth(3).frameLocator("iframe").getByText("JS works 42").waitFor();
  assert.equal(externalRequests, 0);
  await blocks.nth(0).getByRole("button", { name: "Close preview" }).click();
  assert.equal(await blocks.nth(0).locator("iframe").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  console.log("PASS: opt-in isolated HTML, SVG, CSS and JavaScript previews, blocked network and mobile layout");
} finally { await browser.close(); }
