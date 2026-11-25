import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true });
  await page.route("https://generativelanguage.googleapis.com/v1beta/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ headers: { ...headers, "Content-Type": "text/event-stream" }, body: 'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"STOP"}]}\n\n' });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "Gemini", exact: true }).click();
  await page.getByLabel("Model ID").fill("long-model-identifier-for-mobile-testing");
  await page.getByLabel("Request thought summaries").check();
  await page.getByLabel("Save encrypted on this device").uncheck();
  await page.getByPlaceholder("Enter API key or token").fill("test-only-key");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const check = async (width, stage) => {
    await page.setViewportSize({ width, height: 720 });
    const data = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const row = document.querySelector(".composer-actions");
      const selectors = [".composer-attach", ".composer-reasoning:not(.composer-thoughts)", ".composer-thoughts", ".model-pill", ".composer-effort", ".send"];
      const children = selectors.map(s => ({ selector: s, rect: rect(row.querySelector(s)) }));
      const privacy = document.querySelector(".privacy span");
      const textNode = [...privacy.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const range = document.createRange(); range.selectNodeContents(textNode);
      return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, composer: rect(document.querySelector(".composer")), row: rect(row), rowScroll: row.scrollWidth, rowClient: row.clientWidth, children, icon: rect(privacy.querySelector("svg")), firstText: rect({ getBoundingClientRect: () => range.getClientRects()[0] }) };
    });
    assert.equal(data.documentWidth, width, `${stage} ${width}: horizontal overflow`);
    assert.ok(Math.abs(data.composer.left - (width - data.composer.right)) <= 1, `${stage} ${width}: composer not centered`);
    assert.ok(data.rowScroll <= data.rowClient + 1, `${stage} ${width}: toolbar overflow`);
    for (const { selector, rect } of data.children) {
      assert.ok(rect.left >= data.row.left - 1 && rect.right <= data.row.right + 1, `${stage} ${width}: ${selector} clipped`);
      assert.ok(rect.width >= 44 && rect.height >= 44, `${stage} ${width}: ${selector} touch target`);
    }
    const model = data.children.find(item => item.selector === ".model-pill").rect;
    const effort = data.children.find(item => item.selector === ".composer-effort").rect;
    assert.ok(model.width >= 90, `${stage} ${width}: model name too narrow`);
    if (width <= 420) assert.ok(effort.width >= 120, `${stage} ${width}: effort label too narrow`);
    assert.ok(Math.abs(data.firstText.top - data.icon.top) < 8, `${stage} ${width}: privacy icon detached`);
  };
  for (const width of [320, 360, 390, 430]) await check(width, "empty");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Hello");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Hello", { exact: true }).last().waitFor();
  await page.locator(".message.assistant").getByText("Saved locally").waitFor();
  for (const width of [320, 360, 390, 430]) await check(width, "conversation");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Expand message editor" }).click();
  await page.waitForFunction(() => document.querySelector(".composer[data-expanded=true] textarea") === document.activeElement);
  await page.waitForFunction(() => Boolean(document.querySelector(".composer[data-expanded=true] .composer-effort:not(:disabled)")));
  await page.getByRole("dialog", { name: "Expanded message editor" }).getByLabel("Reasoning effort").focus();
  assert.equal(await page.getByRole("dialog", { name: "Expanded message editor" }).getByLabel("Reasoning effort").evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Escape");
  console.log("PASS: centered mobile composer, readable controls, privacy alignment and expanded editor");
} finally { await browser.close(); }
