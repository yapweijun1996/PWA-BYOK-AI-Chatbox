import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 750 }, locale: "en-US" });
  await page.route("https://api.openai.com/v1/**", async (route) => {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    assert.ok(route.request().url().endsWith("/responses"));
    return route.fulfill({ status: 429, headers, json: { error: { code: "insufficient_quota", message: "private server text" } } });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  await page.getByLabel("Model ID").fill("gpt-6-luna");
  await page.getByLabel("OpenAI API mode").selectOption("responses");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByPlaceholder("Enter key for this session").fill("test-only-key");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Test error");
  await page.getByRole("button", { name: "Send message" }).click();
  const error = page.locator(".response-error");
  await error.getByText("OpenAI quota or credits are exhausted. Check your billing and usage limits before retrying.").waitFor();
  assert.equal(await page.getByText("private server text").count(), 0);
  console.log("PASS: Responses API failure guidance appears in the message without exposing raw server text");
} finally { await browser.close(); }
