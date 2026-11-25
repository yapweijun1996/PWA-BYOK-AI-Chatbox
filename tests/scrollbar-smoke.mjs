import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.evaluate(() => {
    const element = document.createElement("div");
    element.id = "scrollbar-test";
    element.style.cssText =
      "position:fixed;left:100px;top:100px;width:100px;height:100px;overflow:auto;z-index:9999";
    element.innerHTML = '<div style="width:300px;height:300px"></div>';
    document.body.append(element);
  });
  const fixture = page.locator("#scrollbar-test");
  const styles = () =>
    fixture.evaluate((element) => ({
      width: getComputedStyle(element).scrollbarWidth,
      color: getComputedStyle(element).scrollbarColor,
    }));
  assert.equal((await styles()).width, "thin");
  assert.match((await styles()).color, /119, 125, 136/);
  await fixture.hover();
  assert.match((await styles()).color, /85, 91, 102/);
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  assert.match((await styles()).color, /195, 197, 205/);
  await page.mouse.move(0, 0);
  assert.match((await styles()).color, /161, 164, 175/);
  await fixture.evaluate((element) => {
    element.scrollTop = 40;
    element.scrollLeft = 40;
  });
  assert.deepEqual(
    await fixture.evaluate((element) => [
      element.scrollTop,
      element.scrollLeft,
    ]),
    [40, 40],
  );
  await page.emulateMedia({ forcedColors: "active" });
  assert.equal((await styles()).width, "auto");
  assert.equal((await styles()).color, "auto");
  await context.close();

  const touch = await browser.newContext({
    viewport: { width: 320, height: 700 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await touch.newPage();
  await mobile.goto(base);
  await mobile.locator('html[data-startup="ready"]').waitFor();
  assert.equal(
    await mobile
      .locator(".history")
      .evaluate((element) => getComputedStyle(element).scrollbarWidth),
    "auto",
  );
  await touch.close();
  console.log(
    "PASS: themed thin scrollbars, hover, scrolling, forced colors and touch defaults",
  );
} finally {
  await browser.close();
}
