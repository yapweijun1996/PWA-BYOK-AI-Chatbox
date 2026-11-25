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
      const select = row.querySelector(".composer-effort");
      const style = getComputedStyle(select);
      const canvas = document.createElement("canvas").getContext("2d");
      canvas.font = style.font;
      const labelWidth = canvas.measureText(select.selectedOptions[0].textContent).width;
      const labelSpace = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { labelWidth, labelSpace, compact: getComputedStyle(row).display === "grid", arrow: rect(row.querySelector(".composer-effort-wrap svg")), width: innerWidth, documentWidth: document.documentElement.scrollWidth, composer: rect(document.querySelector(".composer")), row: rect(row), rowScroll: row.scrollWidth, rowClient: row.clientWidth, effortFontSize: parseFloat(getComputedStyle(row.querySelector(".composer-effort")).fontSize), children, icon: rect(privacy.querySelector("svg")), firstText: rect({ getBoundingClientRect: () => range.getClientRects()[0] }) };
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
    assert.ok(data.labelWidth <= data.labelSpace + 1, `${stage} ${width}: selected effort label clipped`);
    assert.ok(data.arrow.width === 18 && data.arrow.height === 18, `${stage} ${width}: dropdown icon size`);
    assert.ok(data.effortFontSize >= 16, `${stage} ${width}: effort font risks iOS zoom`);
    const send = data.children.find(item => item.selector === ".send").rect;
    assert.ok(Math.abs(effort.top - model.top) <= 1 && Math.abs(effort.bottom - model.bottom) <= 1, `${stage} ${width}: effort and model heights differ`);
    assert.ok(Math.abs(effort.top - send.top) <= 1 && Math.abs(effort.bottom - send.bottom) <= 1, `${stage} ${width}: effort and send heights differ`);
    assert.ok(model.width >= 90, `${stage} ${width}: model name too narrow`);
    if (data.compact) assert.ok(effort.width >= 132, `${stage} ${width}: effort label too narrow`);
    else assert.ok(effort.width >= 148, `${stage} ${width}: effort selector shrank`);
    assert.ok(Math.abs(data.firstText.top - data.icon.top) < 8, `${stage} ${width}: privacy icon detached`);
  };
  for (const width of [320, 360, 390, 421, 430, 480, 520, 521, 522, 540, 600, 767]) await check(width, "empty");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Hello");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Hello", { exact: true }).last().waitFor();
  await page.locator(".message.assistant").getByText("Saved locally").waitFor();
  for (const width of [320, 360, 390, 421, 430, 480, 520, 521, 522, 540, 600, 767]) await check(width, "conversation");
  const checkTablet = async width => {
    await page.setViewportSize({ width, height: 720 });
    const layout = await page.evaluate(() => {
      const row = document.querySelector(".composer-actions");
      const select = row.querySelector(".composer-effort");
      const model = row.querySelector(".model-pill");
      const style = getComputedStyle(select);
      const canvas = document.createElement("canvas").getContext("2d");
      canvas.font = style.font;
      return {
        scroll: row.scrollWidth, client: row.clientWidth,
        modelWidth: model.getBoundingClientRect().width,
        labelWidth: canvas.measureText(select.selectedOptions[0].textContent).width,
        labelSpace: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      };
    });
    assert.ok(layout.scroll <= layout.client + 1, `tablet ${width}: toolbar overflow`);
    assert.ok(layout.modelWidth >= 90, `tablet ${width}: model label too narrow`);
    assert.ok(layout.labelWidth <= layout.labelSpace + 1, `tablet ${width}: selected effort label clipped`);
  };
  for (const width of [768, 800, 900, 1024]) await checkTablet(width);
  await page.getByRole("separator", { name: "Resize sidebar" }).press("End");
  await page.waitForFunction(() => document.querySelector('[role="separator"][aria-label="Resize sidebar"]')?.getAttribute("aria-valuenow") === "440");
  await checkTablet(1024);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Expand message editor" }).click();
  await page.waitForFunction(() => document.querySelector(".composer[data-expanded=true] textarea") === document.activeElement);
  await page.waitForFunction(() => Boolean(document.querySelector(".composer[data-expanded=true] .composer-effort:not(:disabled)")));
  await page.getByRole("dialog", { name: "Expanded message editor" }).getByLabel("Reasoning effort").focus();
  assert.equal(await page.getByRole("dialog", { name: "Expanded message editor" }).getByLabel("Reasoning effort").evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Escape");
  for (const language of ["zh-CN", "ms"]) {
    await page.evaluate(language => new Promise((resolve, reject) => {
      const open = indexedDB.open("luma-chat");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("settings", "readwrite");
        const store = tx.objectStore("settings");
        const read = store.get("settings");
        read.onsuccess = () => { const settings = read.result; settings.language = language; store.put(settings, "settings"); };
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
      };
    }), language);
    await page.reload();
    await page.locator(".composer-effort").waitFor();
    for (const width of [320, 430, 521]) await check(width, language);
  }
  console.log("PASS: centered mobile composer, readable controls, privacy alignment and expanded editor");
} finally { await browser.close(); }
