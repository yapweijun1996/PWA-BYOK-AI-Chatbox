import { chromePath } from "./browser-launch.mjs";
import { waitForSavedSettings } from "./browser-storage.mjs";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const url = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = match(query);
      if (query === "(prefers-color-scheme: dark)")
        media.addEventListener("change", (event) => {
          if (window.holdSystemThemeEvent) event.stopImmediatePropagation();
        });
      return media;
    };
  });
  await page.goto(url);
  const sidebar = page.locator("#chat-sidebar");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  assert.equal(await sidebar.isVisible(), false);
  await waitForSavedSettings(page, { sidebarCollapsed: true });
  await page.reload();
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expand.waitFor();
  assert.equal(await expand.getAttribute("aria-expanded"), "false");
  assert.equal(await sidebar.isVisible(), false);
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .press("Enter");
  const heading = page.getByRole("heading", { name: "Settings", exact: true });
  await heading.waitFor();
  assert.ok(await heading.evaluate((element) => element.matches(":focus")));
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  assert.equal(
    await nav
      .getByRole("button", { name: "AI providers" })
      .getAttribute("aria-current"),
    "page",
  );
  await nav.getByRole("button", { name: "Appearance" }).click();
  const theme = page.getByLabel("Theme", { exact: true });
  await theme.selectOption("dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  const contrast = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const luminance = (color) => {
      const [r, g, b] = color
        .match(/\d+/g)
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    const a = luminance(body.color),
      b = luminance(body.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert.ok(contrast >= 4.5);
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByRole("heading", { name: "外观" }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.getByRole("button", { name: "本地数据", exact: true }).click();
  await page.getByRole("heading", { name: "本地数据" }).waitFor();
  await waitForSavedSettings(page, { language: "zh-CN", theme: "dark" });
  await page.reload();
  await page.getByRole("button", { name: "展开侧栏" }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole("button", { name: "打开菜单" }).click();
  const drawer = page.getByRole("dialog", { name: "工作区" });
  await drawer.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  const chineseTheme = page.getByLabel("主题", { exact: true });
  assert.equal(await chineseTheme.inputValue(), "dark");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await chineseTheme.selectOption("light");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.evaluate(() => {
    window.holdSystemThemeEvent = true;
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  await chineseTheme.selectOption("system");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.evaluate(() => {
    window.holdSystemThemeEvent = false;
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.locator('html[data-theme="light"]').waitFor();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator('html[data-theme="dark"]').waitFor();
  await chineseTheme.selectOption("light");
  await page.getByLabel("语言", { exact: true }).selectOption("en");
  const updateBounds = await page
    .getByRole("button", { name: /Check for updates/ })
    .boundingBox();
  assert.ok(updateBounds && updateBounds.x + updateBounds.width <= 320);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await waitForSavedSettings(page, { language: "en", theme: "light" });
  await page.reload();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("dialog", { name: "Workspace" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await nav.getByRole("button", { name: "Appearance" }).click();
  assert.equal(
    await page.getByLabel("Language", { exact: true }).inputValue(),
    "en",
  );
  assert.equal(await theme.inputValue(), "light");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unified Settings, keyboard navigation, localization, mobile preferences, persistence, and dark contrast",
  );
} finally {
  await browser.close();
}
