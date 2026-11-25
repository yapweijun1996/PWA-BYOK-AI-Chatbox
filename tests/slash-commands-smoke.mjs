import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Start a new chat" }).click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const menu = page.getByRole("listbox", { name: "Slash commands" });
  await input.fill("/");
  assert.equal(await menu.getByRole("option").count(), 5);
  await input.press("ArrowDown");
  assert.equal(
    await menu
      .getByRole("option", { name: "/search Search conversations" })
      .getAttribute("aria-selected"),
    "true",
  );
  await input.press("Enter");
  const search = page.getByRole("dialog", { name: "Search conversations" });
  await search.waitFor();
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "hidden" });
  assert.equal(await input.inputValue(), "");

  await input.fill("/model");
  await input.press("Enter");
  const model = page.getByRole("dialog", { name: "Choose model" });
  await model.waitFor();
  await page.keyboard.press("Escape");
  await model.waitFor({ state: "hidden" });

  await input.fill("/js");
  await input.press("Enter");
  assert.equal(
    await page
      .getByRole("button", { name: "Local tools for next reply" })
      .getAttribute("aria-pressed"),
    "true",
  );
  await input.fill("/js");
  await input.press("Enter");
  assert.equal(
    await page
      .getByRole("button", { name: "Local tools for next reply" })
      .getAttribute("aria-pressed"),
    "false",
  );

  await input.fill("/settings");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("retained attachment"),
  });
  await page.getByText("notes.txt").waitFor();
  await input.press("Enter");
  await page.getByRole("heading", { name: "AI providers" }).waitFor();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.getByText("notes.txt").waitFor();

  await input.fill("/new");
  await input.press("Escape");
  assert.equal(await menu.count(), 0);
  assert.equal(await input.inputValue(), "/new");
  await input.fill("/unknown");
  assert.equal(await menu.count(), 0);
  await input.fill("/new ordinary text");
  assert.equal(await menu.count(), 0);

  await input.fill("/new");
  await input.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.history-name[title="New chat"]').length === 2,
  );
  assert.equal(await input.inputValue(), "");
  await page.locator('.history-name[title="New chat"]').nth(1).click();
  await page.getByText("notes.txt").waitFor();
  await page.locator('.history-name[title="New chat"]').first().click();
  await page.waitForFunction(() => !document.querySelector(".file-chip"));
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  assert.equal(await input.inputValue(), "");

  const sent = [];
  await page.route(
    "http://localhost:1234/v1/chat/completions",
    async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/event-stream",
        },
        body: 'data: {"choices":[{"delta":{"content":"Mock response"}}]}\n\ndata: [DONE]\n\n',
      });
    },
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID", { exact: true }).fill("slash-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await input.fill("/unknown");
  await input.press("Enter");
  await page.getByText("Mock response").waitFor();
  await input.fill("/new");
  await input.press("Escape");
  await input.press("Enter");
  await page.getByText("Mock response").nth(1).waitFor();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].messages.at(-1).content, "/unknown");
  assert.equal(sent[1].messages.at(-1).content, "/new");

  const mobile = await browser.newContext({
    viewport: { width: 320, height: 640 },
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
  });
  const phone = await mobile.newPage();
  await phone.goto(base);
  await phone.getByRole("button", { name: "Start a new chat" }).click();
  const phoneInput = phone.getByRole("textbox", {
    name: "Message",
    exact: true,
  });
  await phoneInput.fill("/se");
  await phone.getByRole("button", { name: "Close slash commands" }).tap();
  assert.equal(await phoneInput.inputValue(), "/se");
  assert.equal(
    await phone.getByRole("listbox", { name: "Slash commands" }).count(),
    0,
  );
  await phoneInput.fill("/");
  await phoneInput.fill("/se");
  const phoneMenu = phone.getByRole("listbox", { name: "Slash commands" });
  assert.equal(await phoneMenu.getByRole("option").count(), 2);
  assert.ok(
    await phoneMenu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0;
    }),
  );
  await phoneMenu
    .getByRole("option", { name: "/settings Open provider settings" })
    .tap();
  await phone.getByRole("heading", { name: "AI providers" }).waitFor();
  await mobile.close();
  console.log(
    "PASS: slash command keyboard and touch actions, filtering, dismissal, and draft persistence",
  );
} finally {
  await browser.close();
}
