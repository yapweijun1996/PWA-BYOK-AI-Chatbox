import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 320, height: 700 } });
  const received = [];
  await page.route("https://api.openai.com/v1/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    received.push({ auth: route.request().headers().authorization, body: route.request().postDataJSON() });
    const output = [{ type: "message", id: "msg", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] }];
    const events = [{ type: "response.output_text.delta", delta: "OK" }, { type: "response.completed", response: { status: "completed", output } }];
    return route.fulfill({ headers: { ...headers, "Content-Type": "text/event-stream" }, body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  await page.getByLabel("Model ID").fill("gpt-6-luna");
  await page.getByLabel("OpenAI API mode").selectOption("responses");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  assert.equal(await page.getByLabel("Save encrypted on this device").isChecked(), true);
  assert.equal(await page.getByLabel("Unlock password").count(), 0);
  await page.getByPlaceholder("Enter API key or token").fill("test-device-secret");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByText("Key saved on this device.").waitFor();
  const vault = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("luma-chat");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const get = request.result.transaction("settings").objectStore("settings").get("settings");
      get.onsuccess = () => { const vault = get.result.vaults.openai; resolve({ version: vault.version, extractable: vault.key.extractable, serialized: JSON.stringify(vault) }); };
      get.onerror = () => reject(get.error);
    };
  }));
  assert.equal(vault.version, 2);
  assert.equal(vault.extractable, false);
  assert.ok(!vault.serialized.includes("test-device-secret"));
  await page.getByRole("button", { name: "Back to chat" }).click();
  const effort = page.locator(".composer").getByLabel("Reasoning effort");
  await effort.selectOption("high");
  assert.equal(await effort.inputValue(), "high");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.reload();
  await page.locator(".composer").getByLabel("Reasoning effort").waitFor();
  assert.equal(await page.locator(".composer").getByLabel("Reasoning effort").inputValue(), "high");
  const send = page.getByRole("button", { name: "Send message" });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Hello");
  await send.click();
  await page.getByText("OK", { exact: true }).waitFor();
  assert.equal(received[0].auth, "Bearer test-device-secret");
  assert.equal(received[0].body.reasoning.effort, "high");
  await page.locator(".message.assistant").getByText("Saved locally").waitFor();
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("luma-chat");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction("settings", "readwrite");
      const store = tx.objectStore("settings");
      const get = store.get("settings");
      get.onsuccess = () => { const settings = get.result; settings.vaults.openai = { version: 1, salt: "old-salt", iv: "old-iv", data: "legacy-data", iterations: 600000 }; store.put(settings, "settings"); };
      tx.oncomplete = () => { request.result.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }));
  await page.setViewportSize({ width: 1000, height: 740 });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  await page.getByText("A key was saved with the old password system.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("Unlock password").count(), 0);
  const legacy = await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open("luma-chat"); request.onsuccess = () => { const get = request.result.transaction("settings").objectStore("settings").get("settings"); get.onsuccess = () => resolve(get.result.vaults.openai.data); };
  }));
  assert.equal(legacy, "legacy-data");
  console.log("PASS: composer effort, mobile overflow, automatic device credential restore and encrypted IndexedDB storage");
} finally { await browser.close(); }
