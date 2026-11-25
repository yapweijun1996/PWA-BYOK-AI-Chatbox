import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { exerciseCrossTabEditing } from "./cross-tab-workspace.mjs";
import {
  holdConversationWrite,
  waitForSavedConversation,
  waitForSavedSettings,
} from "./browser-storage.mjs";

const url = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  const sidebar = page.locator("#chat-sidebar");
  const draft = page.getByRole("textbox", { name: "Message", exact: true });
  const actions = (name) =>
    sidebar.getByRole("button", { name: `Actions for ${name}`, exact: true });
  const dialog = (name) => page.getByRole("dialog", { name, exact: true });
  const pinned = sidebar.getByRole("region", { name: "Pinned" });
  const recent = sidebar.getByRole("region", { name: "Recent" });

  await sidebar
    .getByRole("button", { name: "New chat", exact: true })
    .press("Enter");
  await draft.fill("Do not lose this workspace draft");
  await actions("New chat").press("Enter");
  const menu = dialog("Conversation actions");
  await menu
    .getByRole("button", { name: "Rename conversation" })
    .press("Enter");
  const rename = dialog("Rename conversation");
  await rename.getByLabel("Conversation name").fill("Release notes");
  await page.evaluate(() => {
    // Reopening must not depend on delivery of the browser's queued close event.
    const closedPanel = document.querySelector(
      "dialog.workspace-actions[open]",
    );
    const holdClose = (event) => {
      if (event.target !== closedPanel) return;
      event.stopImmediatePropagation();
      document.removeEventListener("close", holdClose, true);
    };
    document.addEventListener("close", holdClose, true);
  });
  await rename.getByRole("button", { name: "Save changes" }).click();
  await actions("Release notes").press("Enter");
  await menu.waitFor({ timeout: 3000 });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await actions("Release notes").press("Enter");
  await menu.waitFor();
  await page.keyboard.press("ArrowDown");
  assert.ok(
    await menu
      .getByRole("button", { name: "Pin", exact: true })
      .evaluate((element) => element.matches(":focus")),
  );
  await page.keyboard.press("Enter");
  await pinned
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor();

  await sidebar
    .getByRole("button", { name: "New project", exact: true })
    .click();
  const newProject = dialog("New project");
  await newProject.getByLabel("Project name").fill("Product");
  await newProject.getByRole("button", { name: "Create project" }).click();
  await actions("Release notes").click();
  await menu.getByRole("button", { name: "Move to project" }).click();
  await dialog("Move to project")
    .getByRole("button", { name: "Product", exact: true })
    .click();
  assert.equal(
    await pinned
      .getByRole("button", { name: "Release notes", exact: true })
      .count(),
    1,
  );
  await actions("Release notes").click();
  await menu.getByRole("button", { name: "Unpin", exact: true }).click();
  const product = sidebar.getByRole("list", { name: "Product", exact: true });
  await product
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor();
  const projectToggle = sidebar.locator(".workspace-project-toggle").first();
  assert.equal(await projectToggle.getAttribute("aria-expanded"), "true");
  await projectToggle.press("Enter");
  assert.equal(await projectToggle.getAttribute("aria-expanded"), "false");
  assert.equal(await product.isVisible(), false);
  const otherPage = await page.context().newPage();
  await otherPage.goto(url);
  const otherToggle = otherPage.locator(".workspace-project-toggle").first();
  await otherPage.locator('html[data-startup="ready"]').waitFor();
  assert.equal(await otherToggle.getAttribute("aria-expanded"), "false");
  await otherToggle.click();
  await page.waitForFunction(() => document.querySelector(".workspace-project-toggle")?.getAttribute("aria-expanded") === "true");
  await otherToggle.click();
  await page.waitForFunction(() => document.querySelector(".workspace-project-toggle")?.getAttribute("aria-expanded") === "false");
  await otherPage.close();
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  assert.equal(await projectToggle.getAttribute("aria-expanded"), "false");
  await projectToggle.press("Enter");
  await product.getByRole("button", { name: "Release notes", exact: true }).waitFor();
  assert.equal(await draft.inputValue(), "Do not lose this workspace draft");
  await sidebar
    .getByRole("button", { name: "Project actions for Product" })
    .click();
  assert.equal(
    await dialog("Project actions")
      .getByRole("button", { name: "Delete project" })
      .isDisabled(),
    true,
  );
  await dialog("Project actions")
    .getByRole("button", { name: "Rename project" })
    .click();
  await dialog("Rename project")
    .getByLabel("Project name")
    .fill("Release project");
  await dialog("Rename project")
    .getByRole("button", { name: "Save changes" })
    .click();
  const folder = sidebar.getByRole("list", {
    name: "Release project",
    exact: true,
  });
  await folder
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor();

  await sidebar.getByRole("button", { name: "New chat", exact: true }).click();
  await draft.fill("Second draft stays isolated");
  await page.keyboard.press("Control+k");
  const search = dialog("Search conversations");
  const field = search.getByRole("searchbox", { name: "Search conversations" });
  await field.fill("release project");
  await field.press("ArrowDown");
  assert.ok(
    await search
      .getByRole("button", { name: /Release notes/ })
      .evaluate((element) => element.matches(":focus")),
  );
  await page.keyboard.press("Enter");
  await search.waitFor({ state: "hidden" });
  const activeReleaseNotes = folder
    .getByRole("button", { name: "Release notes", exact: true })
    .and(folder.locator('[aria-current="page"]'));
  await activeReleaseNotes.waitFor();
  assert.equal(await draft.inputValue(), "Do not lose this workspace draft");

  const archiveWrite = await holdConversationWrite(page, {
    title: "Release notes",
    archived: true,
  });
  await actions("Release notes").click();
  await menu.getByRole("button", { name: "Archive conversation" }).click();
  await archiveWrite.held();
  await sidebar.locator(".history-item[aria-busy='true'], .history-name[aria-busy='true']").first().waitFor();
  await sidebar.locator(".sidebar-loader").first().waitFor();
  assert.ok(await activeReleaseNotes.isVisible());
  assert.equal(await draft.inputValue(), "Do not lose this workspace draft");
  await archiveWrite.release("abort");
  await page
    .getByText(
      "Archive change was not saved. Try again or export before reloading.",
    )
    .waitFor();
  await page.reload();
  await activeReleaseNotes.waitFor();
  assert.equal(await draft.inputValue(), "Do not lose this workspace draft");
  await actions("Release notes").click();
  await menu.getByRole("button", { name: "Archive conversation" }).click();
  await folder
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(await draft.inputValue(), "Second draft stays isolated");
  await waitForSavedConversation(page, {
    title: "Release notes",
    archived: true,
    draft: "Do not lose this workspace draft",
  });
  await page.reload();
  await recent
    .getByRole("button", { name: "New chat", exact: true })
    .and(page.locator('[aria-current="page"]'))
    .waitFor();
  assert.equal(await draft.inputValue(), "Second draft stays isolated");
  await sidebar.getByRole("button", { name: "Archived", exact: true }).click();
  assert.equal(
    await search
      .getByRole("button", { name: "Archived", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const restoreWrite = await holdConversationWrite(page, {
    title: "Release notes",
    archived: false,
  });
  const restoreButton = search.getByRole("button", {
    name: "Restore Release notes",
  });
  await restoreButton.click();
  await restoreWrite.held();
  assert.ok(await restoreButton.isVisible());
  await restoreWrite.release("abort");
  await search.getByText("Restore was not saved. Try again.").waitFor();
  await restoreButton.click();
  await search.getByText("No archived conversations.").waitFor();
  await waitForSavedConversation(page, {
    title: "Release notes",
    archived: false,
  });
  await page.keyboard.press("Escape");
  await folder
    .getByRole("button", { name: "Release notes", exact: true })
    .click();
  await activeReleaseNotes.waitFor();
  assert.equal(await draft.inputValue(), "Do not lose this workspace draft");

  const separator = page.getByRole("separator", { name: "Resize sidebar" });
  await separator.press("ArrowRight");
  const handle = await separator.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 110);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 56, handle.y + 110, {
    steps: 3,
  });
  assert.equal((await sidebar.boundingBox()).width, 336);
  await page.mouse.up();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await waitForSavedSettings(page, {
    sidebarCollapsed: true,
    sidebarWidth: 336,
  });
  await page.reload();
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expand.waitFor();
  assert.equal(await sidebar.isVisible(), false);
  await page
    .getByRole("button", { name: "Search conversations", exact: true })
    .press("Enter");
  await search.waitFor();
  await page.keyboard.press("Escape");
  await expand.click();
  assert.equal((await sidebar.boundingBox()).width, 336);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Local data", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const backup = JSON.parse(
    Buffer.concat(
      await (await (await downloading).createReadStream()).toArray(),
    ).toString(),
  );
  const saved = backup.conversations.find(
    ({ title }) => title === "Release notes",
  );
  assert.equal(saved.draft, "Do not lose this workspace draft");
  assert.equal(saved.archived, false);
  assert.equal(saved.pinned, false);
  assert.equal(
    backup.projects.find(({ id }) => id === saved.projectId).name,
    "Release project",
  );
  assert.equal(backup.settings.sidebarWidth, 336);
  assert.ok(!Object.hasOwn(backup.settings, "vaults"));
  await page.getByRole("button", { name: "Back to chat" }).click();

  await page.setViewportSize({ width: 320, height: 650 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const opener = page.getByRole("button", { name: "Open menu" });
  await opener.click();
  const drawer = dialog("Workspace");
  const close = drawer.getByRole("button", { name: "Close menu" });
  assert.ok(await close.evaluate((element) => element.matches(":focus")));
  assert.equal(await page.locator("main").getAttribute("inert"), "");
  await close.press("Shift+Tab");
  assert.ok(
    await drawer
      .getByRole("button", { name: "Settings" })
      .evaluate((element) => element.matches(":focus")),
  );
  await page.keyboard.press("Escape");
  await opener.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Open menu",
  );
  await opener.click();
  await page.locator(".scrim").click({ position: { x: 312, y: 300 } });
  await opener.waitFor();
  await opener.click();
  await drawer.getByRole("button", { name: "Search conversations" }).click();
  const bounds = await search.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320);
  await page.keyboard.press("Escape");
  await drawer.waitFor();
  await actions("Release notes").click();
  await menu.getByRole("button", { name: "Move to project" }).click();
  await dialog("Move to project")
    .getByRole("button", { name: "No project" })
    .click();
  await recent
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor();
  await drawer
    .getByRole("button", { name: "Project actions for Release project" })
    .click();
  await dialog("Project actions")
    .getByRole("button", { name: "Delete project" })
    .click();
  assert.equal(
    await drawer.getByText("Release project", { exact: true }).count(),
    0,
  );
  await actions("Release notes").click();
  page.once("dialog", (request) => request.dismiss());
  await menu.getByRole("button", { name: "Delete conversation" }).click();
  await recent
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor();
  await actions("Release notes").click();
  page.once("dialog", (request) => request.accept());
  await menu.getByRole("button", { name: "Delete conversation" }).click();
  await recent
    .getByRole("button", { name: "Release notes", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);

  const restored = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1200, height: 800 },
  });
  await restored.goto(url);
  await restored.getByRole("button", { name: "Settings", exact: true }).click();
  await restored
    .getByRole("button", { name: "Local data", exact: true })
    .click();
  await restored.locator('input[type="file"]').setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  assert.equal(await restored.getByLabel("Also import appearance and provider settings").isChecked(), false);
  await restored
    .getByRole("button", { name: "Import and skip conflicts" })
    .click();
  await restored.getByText("Imported 2 conversations.").waitFor();
  await restored.reload();
  const restoredFolder = restored.getByRole("list", {
    name: "Release project",
    exact: true,
  });
  const restoredReleaseNotes = restoredFolder.getByRole("button", {
    name: "Release notes",
    exact: true,
  });
  await restoredReleaseNotes.click();
  await restoredReleaseNotes
    .and(restoredFolder.locator('[aria-current="page"]'))
    .waitFor();
  assert.equal(
    await restored
      .getByRole("textbox", { name: "Message", exact: true })
      .inputValue(),
    saved.draft,
  );
  assert.equal(
    (await restored.locator("#chat-sidebar").boundingBox()).width,
    264,
  );
  await restored.close();
  await exerciseCrossTabEditing(browser, url);
  for (const [locale, menuLabel, workspaceLabel] of [["en-US", "Open menu", "Workspace"], ["zh-CN", "打开菜单", "工作区"], ["ms-MY", "Buka menu", "Ruang kerja"]]) {
    const mobileContext = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, locale });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(url);
    await mobilePage.locator('html[data-startup="ready"]').waitFor();
    await mobilePage.getByRole("button", { name: menuLabel }).click();
    const mobileSidebar = mobilePage.getByRole("dialog", { name: workspaceLabel });
    await mobileSidebar.waitFor();
    assert.ok(await mobileSidebar.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    assert.ok(await mobileSidebar.locator(".workspace-action:visible, .workspace-more:visible").evaluateAll((nodes) => nodes.every((node) => node.getBoundingClientRect().height >= 44)));
    await mobileContext.close();
  }

  console.log(
    "PASS: workspace search, keyboard actions, pinning, projects, archive/restore, verified backup, desktop resize/collapse, and mobile drawer/delete",
  );
} finally {
  await browser.close();
}
