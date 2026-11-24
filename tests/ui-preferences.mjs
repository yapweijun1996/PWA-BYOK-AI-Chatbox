import { chromePath } from "./browser-launch.mjs";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  const sidebar = page.locator("#chat-sidebar");
  const toggle = page.getByRole("button", { name: "Language and theme" });
  const panel = page.getByRole("group", { name: "Language and theme" });
  await toggle.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Tab");
  assert.ok(
    await panel.getByLabel("Theme").evaluate((el) => el.matches(":focus")),
  );
  await page.keyboard.press("Escape");
  assert.equal(await panel.count(), 0);
  assert.ok(await toggle.evaluate((el) => el.matches(":focus")));
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  assert.equal(await sidebar.isVisible(), false);
  assert.equal(
    await page
      .getByRole("button", { name: "Expand sidebar" })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.reload();
  await page.getByRole("button", { name: "Expand sidebar" }).waitFor();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  assert.equal(await sidebar.getByRole("combobox").count(), 0);
  await toggle.click();
  await panel.getByLabel("Theme").selectOption("dark");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(
    await page
      .locator("main")
      .getByLabel("Theme", { exact: true })
      .inputValue(),
    "dark",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { fg: body.color, bg: body.backgroundColor };
  });
  function rgb(str) {
    return str
      .match(/\d+/g)
      .slice(0, 3)
      .map(Number)
      .map((x) => {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
  }
  function luminance(str) {
    const [r, g, b] = rgb(str);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const a = luminance(colors.fg),
    b = luminance(colors.bg);
  assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5);
  await toggle.click();
  await panel.getByLabel("Language").selectOption("zh-CN");
  await page.getByRole("button", { name: "语言与主题" }).click();
  await page.getByRole("heading", { name: "外观" }).waitFor();
  assert.equal(
    await page.locator("main").getByLabel("语言", { exact: true }).inputValue(),
    "zh-CN",
  );
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await page.reload();
  await page.getByRole("button", { name: "展开侧栏" }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByRole("heading", { name: "外观" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page
    .locator("main")
    .getByLabel("主题", { exact: true })
    .selectOption("light");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .locator("main")
    .getByLabel("主题", { exact: true })
    .selectOption("system");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "返回对话" }).click();
  await page.setViewportSize({ width: 320, height: 640 });
  const mobilePanel = page.getByRole("group", { name: "语言与主题" });
  await page.getByRole("button", { name: "语言与主题" }).click();
  const bounds = await mobilePanel.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320);
  const updateBounds = await page
    .getByRole("button", { name: /检查更新/ })
    .boundingBox();
  assert.ok(updateBounds && updateBounds.x + updateBounds.width <= 320);
  assert.equal(await mobilePanel.getByLabel("主题").inputValue(), "system");
  await mobilePanel.getByLabel("主题").selectOption("light");
  await mobilePanel.getByLabel("语言").selectOption("en");
  assert.equal(await panel.getByLabel("Language").inputValue(), "en");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.locator(".privacy").click();
  assert.equal(await panel.count(), 0);
  await page.reload();
  await toggle.click();
  assert.equal(await panel.getByLabel("Language").inputValue(), "en");
  assert.equal(await panel.getByLabel("Theme").inputValue(), "light");
  assert.deepEqual(errors, []);
  const chineseSystem = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 390, height: 844 },
  });
  const chinesePage = await chineseSystem.newPage();
  await chinesePage.goto(
    process.env.TEST_BASE_URL || "http://127.0.0.1:55167/",
  );
  await chinesePage.getByRole("button", { name: "打开菜单" }).click();
  await chinesePage
    .getByRole("button", { name: "新对话", exact: true })
    .waitFor();
  assert.equal(await chinesePage.locator("html").getAttribute("lang"), "zh-CN");
  await chineseSystem.close();
  console.log(
    "PASS: keyboard and mobile top-bar preferences, Appearance sync, persistence, and dark contrast",
  );
  await context.close();
} finally {
  await browser.close();
}
