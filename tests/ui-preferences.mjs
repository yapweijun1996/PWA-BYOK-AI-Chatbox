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
  await sidebar.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
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
  await sidebar.getByLabel("Language", { exact: true }).selectOption("zh-CN");
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
  await chinesePage.getByRole("button", { name: "新对话", exact: true }).waitFor();
  assert.equal(await chinesePage.locator("html").getAttribute("lang"), "zh-CN");
  await chineseSystem.close();
  console.log(
    "PASS: sidebar toggle, mobile drawer, language and theme persistence, dark contrast and system theme",
  );
  await context.close();
} finally {
  await browser.close();
}
