import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const content = [
  '```html', '<!doctype html><html><body><h1 id="title">Hello</h1><script>document.querySelector("#title").textContent="Rendered HTML";console.log("HTML log");console.warn("HTML warning");console.error("HTML error");try{parent.document.body.dataset.compromised="yes"}catch(e){document.body.dataset.isolated="yes"}</script></body></html>', '```', '',
  '```html', '<meta http-equiv="refresh" content="0;url=https://preview-network.invalid/refresh"><a href="https://preview-network.invalid/link">External</a><img src="https://preview-network.invalid/image"><script>location.href="https://preview-network.invalid/navigation"</script>', '```', '',
  '```svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="15" fill="red"/></svg>', '```', '',
  '```css', 'h1 { color: rgb(255, 0, 0); }', '```', '',
  '```javascript', 'console.log("JS works", 42, typeof fetch, typeof document); throw new Error("Preview failure");', '```', '',
  '```js', 'for (;;) {}', '```', '',
  '```js', 'for (;;) {}', '```', '',
  '```python', 'print("no preview")', '```',
].join('\n');
const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.previewClipboard = text; } }, configurable: true });
    const OriginalWorker = window.Worker;
    window.previewWorkers = { started: 0, terminated: 0 };
    window.Worker = class extends OriginalWorker {
      constructor(url, options) {
        super(url, options);
        if (options?.name === "luma-quickjs") {
          window.previewWorkers.started++;
          const terminate = this.terminate.bind(this);
          this.terminate = () => { window.previewWorkers.terminated++; terminate(); };
        }
      }
    };
  });
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
  assert.equal(await blocks.count(), 8);
  assert.equal(await blocks.nth(7).getByRole("button", { name: "Preview", exact: true }).count(), 0);
  assert.equal(await reply.locator("iframe").count(), 0);
  for (let i = 0; i < 7; i++) await blocks.nth(i).getByRole("button", { name: "Preview", exact: true }).click();
  const html = blocks.nth(0).frameLocator("iframe");
  await html.locator("#title").getByText("Hello", { exact: true }).waitFor();
  assert.equal(await blocks.nth(0).locator("iframe").getAttribute("sandbox"), "");
  assert.equal(await html.locator("script").count(), 0);
  const staticDanger = blocks.nth(1).frameLocator("iframe");
  await staticDanger.getByText("External").waitFor();
  assert.equal(await staticDanger.locator("a").getAttribute("href"), null);
  assert.equal(await staticDanger.locator("meta[http-equiv=refresh]").count(), 0);
  assert.equal(await staticDanger.locator("script").count(), 0);
  await blocks.nth(2).frameLocator("iframe").locator("svg circle").waitFor();
  assert.equal(await blocks.nth(3).frameLocator("iframe").locator("h1").evaluate(el => getComputedStyle(el).color), "rgb(255, 0, 0)");
  await blocks.nth(0).getByText("Interactive preview can navigate to external sites", { exact: false }).waitFor();
  await blocks.nth(0).getByRole("button", { name: "Enable interactive preview" }).click();
  await html.locator("#title").getByText("Rendered HTML").waitFor();
  assert.equal(await html.locator("body").getAttribute("data-isolated"), "yes");
  assert.equal(await page.locator("body").getAttribute("data-compromised"), null);
  const consolePanel = blocks.nth(0).locator(".rich-preview-console");
  await consolePanel.getByText("HTML log", { exact: false }).waitFor();
  await consolePanel.getByText("Errors: 1").waitFor();
  await consolePanel.getByText("Warnings: 1").waitFor();
  await consolePanel.locator("summary").click();
  assert.equal(await consolePanel.evaluate(el => el.open), false);
  await consolePanel.locator("summary").click();
  await consolePanel.getByRole("button", { name: "Copy console" }).click();
  assert.match(await page.evaluate(() => window.previewClipboard), /\[error\] HTML error/);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("denied"); }; });
  await consolePanel.getByRole("button", { name: "Copy console" }).click();
  await consolePanel.getByText("Copy unavailable.").waitFor();
  await consolePanel.getByRole("button", { name: "Clear console" }).click();
  await consolePanel.getByText("No console output yet.").waitFor();
  await html.locator("body").evaluate(() => { for (let i = 0; i < 105; i++) console.log("item", i); });
  await consolePanel.getByText("Some console output was omitted because the limit was reached.").waitFor();
  await page.evaluate(() => window.postMessage({ __lumaPreview: 1, level: "error", text: "spoofed parent" }, "*"));
  assert.equal(await consolePanel.getByText("spoofed parent", { exact: false }).count(), 0);
  await blocks.nth(0).getByRole("button", { name: "Stop interactive preview" }).click();
  assert.equal(await blocks.nth(0).locator("iframe").getAttribute("sandbox"), "");
  await blocks.nth(2).getByLabel("Preview size").selectOption("mobile");
  assert.equal(await blocks.nth(2).locator("iframe").evaluate(el => Math.round(el.getBoundingClientRect().width)), 375);
  await blocks.nth(2).getByLabel("Preview size").selectOption("desktop");
  assert.equal(await blocks.nth(2).locator("iframe").evaluate(el => Math.round(el.getBoundingClientRect().width)), 1280);
  for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await blocks.nth(2).getByLabel("Preview size").selectOption("responsive");
    await blocks.nth(2).getByRole("button", { name: "Full screen" }).click();
    const dialog = page.getByRole("dialog", { name: "Code preview" });
    await dialog.waitFor();
    const metrics = await dialog.evaluate(el => {
      const panel = el.querySelector(".rich-code-preview");
      const canvas = el.querySelector(".rich-preview-viewport");
      const frame = el.querySelector("iframe");
      const controls = el.querySelector(".rich-preview-controls");
      const button = controls.querySelector("button").getBoundingClientRect();
      const select = controls.querySelector("select").getBoundingClientRect();
      return { width: el.clientWidth, scrollWidth: el.scrollWidth, panelWidth: panel.clientWidth, panelScroll: panel.scrollWidth, canvasHeight: canvas.clientHeight, frameHeight: frame.getBoundingClientRect().height, button, select };
    });
    assert.ok(metrics.scrollWidth <= metrics.width + 1 && metrics.panelScroll <= metrics.panelWidth + 1, `${viewport.width}: full screen should not overflow horizontally`);
    assert.ok(metrics.canvasHeight >= 240 && metrics.frameHeight >= 240, `${viewport.width}: preview canvas is too short`);
    assert.ok(metrics.button.right <= viewport.width && metrics.select.right <= viewport.width, `${viewport.width}: controls are clipped`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await blocks.nth(2).getByRole("button", { name: "Full screen" }).evaluate(el => document.activeElement === el), true, "focus returns to full-screen button");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await blocks.nth(4).getByRole("button", { name: "Run offline" }).click();
  await blocks.nth(4).locator(".rich-preview-result").getByText("Preview failure", { exact: false }).waitFor({ timeout: 15000 });
  await blocks.nth(4).getByText("JS works 42 undefined undefined", { exact: false }).waitFor();
  await blocks.nth(4).getByText("Check the JavaScript code and try again.").waitFor();
  await blocks.nth(4).getByRole("button", { name: "Full screen" }).click();
  await page.getByRole("dialog", { name: "Code preview" }).getByText("Preview failure", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await blocks.nth(4).locator(".rich-preview-result").getByText("Preview failure", { exact: false }).waitFor();
  await blocks.nth(4).getByRole("button", { name: "Clear console" }).click();
  await blocks.nth(4).getByText("No console output yet.").waitFor();
  await blocks.nth(5).getByRole("button", { name: "Run offline" }).click();
  await blocks.nth(5).getByRole("button", { name: "Stop execution" }).click();
  await blocks.nth(5).getByText("Execution cancelled", { exact: false }).waitFor();
  await blocks.nth(6).getByRole("button", { name: "Run offline" }).click();
  await blocks.nth(6).getByText("Execution status: Execution timed out", { exact: true }).waitFor({ timeout: 15000 });
  await blocks.nth(5).getByRole("button", { name: "Run offline" }).click();
  await blocks.nth(5).getByRole("button", { name: "Close preview" }).click();
  await page.waitForFunction(() => window.previewWorkers.terminated === 4);
  assert.equal(await page.evaluate(() => window.previewWorkers.started), 4);
  assert.equal(await page.evaluate(() => window.previewWorkers.terminated), 4);
  assert.equal(externalRequests, 0);
  const navigation = page.waitForRequest(request => request.url().startsWith("https://preview-network.invalid/"));
  await blocks.nth(1).getByRole("button", { name: "Enable interactive preview" }).click();
  await navigation;
  await blocks.nth(0).getByRole("button", { name: "Close preview" }).click();
  assert.equal(await blocks.nth(0).locator("iframe").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  console.log("PASS: static preview blocks scripts and external resources, interactive opt-in, offline JavaScript cancellation and timeout");
} finally { await browser.close(); }
