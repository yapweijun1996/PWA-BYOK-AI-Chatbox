import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";

const modelId = `vendor/${"long-model-name-".repeat(8)}preview`;
const requests = [];
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url === "/v1/models") {
    return res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ data: [{ id: modelId }, { id: "other-model" }] }));
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    requests.push(JSON.parse(body));
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.write('data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n');
    res.setTimeout(10000, () => res.end("data: [DONE]\n\n"));
  });
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://openrouter.ai/api/v1/models", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "vendor/think",
            name: "Vision and Reasoning",
            supported_parameters: ["reasoning", "tools"],
            architecture: { input_modalities: ["text", "image"] },
          },
          {
            id: "vendor/basic",
            name: "Basic Text",
            supported_parameters: ["tools"],
          },
        ],
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const send = page.getByRole("button", { name: "Send message" });
  const form = page.locator(".composer");
  const selector = form.getByRole("button", { name: /^Choose model/ });
  assert.equal(await send.isDisabled(), true);
  await input.focus();
  assert.equal(
    await form.evaluate((element) => getComputedStyle(element).outlineStyle),
    "solid",
  );
  assert.equal(
    await input.evaluate((element) => getComputedStyle(element).resize),
    "none",
  );
  const defaultHeight = (await input.boundingBox()).height;
  assert.equal(
    await input.evaluate((element) => getComputedStyle(element).fontSize),
    "14px",
  );
  await input.fill("One\nTwo\nThree\nFour\nFive\nSix");
  assert.ok((await input.boundingBox()).height > defaultHeight);
  await input.fill("Long draft\n".repeat(50));
  assert.ok(
    await input.evaluate(
      (element) =>
        element.clientHeight <= 320 &&
        element.scrollHeight > element.clientHeight,
    ),
  );
  await input.focus();
  await input.evaluate((element) => element.setSelectionRange(4, 9));
  await page.getByRole("button", { name: "Expand message editor" }).click();
  await page.getByRole("dialog", { name: "Expanded message editor" }).waitFor();
  assert.equal(await input.inputValue(), "Long draft\n".repeat(50));
  assert.deepEqual(
    await input.evaluate((element) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
    [4, 9],
  );
  assert.ok((await input.boundingBox()).height > 320);
  await input.press("Escape");
  await page
    .getByRole("dialog", { name: "Expanded message editor" })
    .waitFor({ state: "hidden" });
  assert.deepEqual(
    await input.evaluate((element) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
    [4, 9],
  );
  await input.fill("");
  assert.equal((await input.boundingBox()).height, defaultHeight);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await applyServerAddress(
    page,
    `http://127.0.0.1:${server.address().port}/v1`,
  );
  await page.getByRole("button", { name: "Back to chat" }).click();
  await selector.click();
  const dialog = page.getByRole("dialog", { name: "Choose model" });
  const search = dialog.getByRole("searchbox", { name: "Search models" });
  assert.equal(
    await search.evaluate((element) => document.activeElement === element),
    true,
  );
  await dialog
    .getByRole("region", { name: "LM Studio" })
    .getByRole("button", { name: "Load models" })
    .click();
  await dialog.getByText(modelId, { exact: true }).waitFor();
  await search.fill("preview");
  assert.equal(
    await dialog.getByText("other-model", { exact: true }).count(),
    0,
  );
  await dialog.getByRole("button", { name: /preview/ }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await selector.getAttribute("title"), modelId);
  await selector.press("Enter");
  await search.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.ok(await selector.evaluate((element) => element.matches(":focus")));

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 740 });
    const sendBox = await send.boundingBox();
    const modelBox = await selector.boundingBox();
    assert.ok(
      sendBox.x >= modelBox.x + modelBox.width &&
        sendBox.x + sendBox.width <= width,
    );
    assert.ok(
      await form.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    );
    if (width < 768) assert.ok(sendBox.width >= 44 && sendBox.height >= 44);
  }
  await page.setViewportSize({ width: 740, height: 320 });
  const landscapeSend = await send.boundingBox();
  assert.ok(landscapeSend.y + landscapeSend.height <= 320);
  await page.setViewportSize({ width: 320, height: 540 });
  await input.fill("Mobile draft");
  assert.equal(
    await input.evaluate((element) => getComputedStyle(element).fontSize),
    "16px",
  );
  await page.getByRole("button", { name: "Expand message editor" }).click();
  const expanded = page.getByRole("dialog", {
    name: "Expanded message editor",
  });
  const expandedBounds = await expanded.boundingBox();
  assert.ok(
    expandedBounds.x >= 0 &&
      expandedBounds.x + expandedBounds.width <= 320 &&
      expandedBounds.y + expandedBounds.height <= 540,
  );
  await page.getByRole("button", { name: "Close expanded editor" }).click();
  assert.equal(await input.inputValue(), "Mobile draft");
  await input.press("End");
  await input.press("Enter");
  assert.equal(await input.inputValue(), "Mobile draft\n");
  assert.equal(requests.length, 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await input.fill("Composer first request");
  await input.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    );
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "中文" }),
    );
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  assert.equal(requests.length, 0);
  assert.equal(await input.inputValue(), "Composer first request");
  await input.press("Shift+Enter");
  assert.ok((await input.inputValue()).includes("\n"));
  await input.fill("Composer first request");
  await page.waitForTimeout(120);
  await input.press("Enter");
  await page.getByText("Partial answer", { exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, modelId);
  await input.fill("Draft typed during streaming");
  assert.equal(await input.inputValue(), "Draft typed during streaming");
  await page.getByRole("button", { name: "Stop generating" }).click();
  await page.getByText("Stopped or interrupted", { exact: true }).waitFor();
  await page
    .locator(".message.assistant")
    .first()
    .getByText("Saved locally", { exact: true })
    .waitFor();
  const stoppedFooter = page.locator(".response-inspector summary").first();
  const stoppedMetrics = await stoppedFooter.innerText();
  assert.match(stoppedMetrics, /TTFT\s+\d/);
  assert.match(stoppedMetrics, /Duration\s+\d/);
  assert.doesNotMatch(stoppedMetrics, /Tokens\s+N\/A/);
  await stoppedFooter.click();
  const stoppedInspector = stoppedFooter.locator("..");
  assert.equal(
    await stoppedInspector
      .locator("dl > div")
      .filter({ has: page.getByText("Total tokens", { exact: true }) })
      .locator("dd")
      .first()
      .innerText(),
    "N/A",
  );
  assert.equal(await input.inputValue(), "Draft typed during streaming");
  assert.equal(
    await page.getByText("Partial answer", { exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  // Keep the outgoing draft transaction alive until the test sees navigation blocked.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    const gate = (window.draftSaveGate = {
      started: false,
      released: false,
      committed: false,
    });
    IDBObjectStore.prototype.put = function (value, ...rest) {
      const request = original.call(this, value, ...rest);
      if (
        this.name === "conversations" &&
        value?.draft === "Other conversation draft"
      ) {
        IDBObjectStore.prototype.put = original;
        gate.started = true;
        const hold = () => {
          if (!gate.released) this.get(value.id).onsuccess = hold;
        };
        this.transaction.addEventListener(
          "complete",
          () => {
            gate.committed = true;
          },
          { once: true },
        );
        hold();
      }
      return request;
    };
  });
  await input.fill("Other conversation draft");
  const history = page.locator(".history");
  const firstChat = history.getByRole("button", {
    name: "Composer first request",
    exact: true,
  });
  const otherChat = history.getByRole("button", {
    name: "New chat",
    exact: true,
  });
  const selected = (name) =>
    history
      .getByRole("button", { name, exact: true })
      .and(history.locator('[aria-current="page"]'))
      .waitFor();
  await firstChat.click();
  await page.waitForFunction(() => window.draftSaveGate.started);
  assert.equal(await input.inputValue(), "Other conversation draft");
  assert.equal(await input.isDisabled(), true);
  assert.equal(await firstChat.getAttribute("aria-current"), null);
  await page.evaluate(() => {
    window.draftSaveGate.released = true;
  });
  await selected("Composer first request");
  assert.equal(await page.evaluate(() => window.draftSaveGate.committed), true);
  assert.equal(await input.inputValue(), "Draft typed during streaming");
  await page.reload();
  await otherChat.click();
  await selected("New chat");
  assert.equal(await input.inputValue(), "Other conversation draft");
  await firstChat.click();
  await selected("Composer first request");
  assert.equal(await input.inputValue(), "Draft typed during streaming");
  assert.equal(await stoppedFooter.innerText(), stoppedMetrics);

  await page.setViewportSize({ width: 320, height: 650 });
  const longFile = `${"a".repeat(110)}.txt`;
  await form.evaluate((element, name) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File(["draft note"], name, { type: "text/plain" }),
    );
    element.dispatchEvent(
      new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true }),
    );
  }, longFile);
  await page.getByRole("button", { name: `Remove ${longFile}` }).waitFor();
  await form.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("second attachment"),
  });
  const attachmentArea = form.getByRole("region", { name: "Attachments" });
  await attachmentArea.getByText("Attachments · 2").waitFor();
  assert.equal(await attachmentArea.getByRole("listitem").count(), 2);
  assert.equal(
    await attachmentArea.getByText(longFile, { exact: true }).count(),
    1,
  );
  assert.equal(
    await form.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: `Remove ${longFile}` }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Remove notes.txt" })
      .evaluate((element) => document.activeElement === element),
    true,
  );
  await attachmentArea.getByText("Attachments · 1").waitFor();
  await page.getByRole("button", { name: "Remove notes.txt" }).click();
  assert.equal(
    await input.evaluate((element) => document.activeElement === element),
    true,
  );
  assert.equal(await form.locator(".file-chip").count(), 0);
  await form.locator('input[type="file"]').setInputFiles(
    ["one.txt", "two.txt", "three.txt", "four.txt"].map((name) => ({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(name),
    })),
  );
  await attachmentArea.getByText("Attachments · 4").waitFor();
  assert.equal(
    await form
      .locator(".file-list")
      .evaluate((element) => element.scrollHeight > element.clientHeight),
    true,
  );
  await page.getByRole("button", { name: "Expand message editor" }).click();
  await page.getByRole("dialog", { name: "Expanded message editor" }).waitFor();
  assert.equal(await form.locator(".file-chip").count(), 4);
  await page.getByRole("button", { name: "Close expanded editor" }).click();
  for (const name of ["one.txt", "two.txt", "three.txt", "four.txt"]) {
    await page.getByRole("button", { name: `Remove ${name}` }).click();
  }
  assert.equal(await form.locator(".file-chip").count(), 0);
  await form.locator('input[type="file"]').setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid payload"),
  });
  await page
    .locator(".toast")
    .getByText("invalid.png: this image could not be read.")
    .waitFor();
  assert.equal(await form.locator(".file-chip").count(), 0);
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await input.evaluate(async (element) => {
    const blob = await (await fetch("./icon-192.png")).blob();
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File([blob], "paste.png", { type: "image/png" }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await form.locator(".file-chip img").waitFor();
  await form.locator(".file-chip img").evaluate((image) => image.decode());
  assert.equal(await send.isDisabled(), true);
  assert.equal(
    await page
      .getByRole("button", { name: "Request reasoning", exact: true })
      .count(),
    0,
  );

  await selector.click();
  await dialog
    .getByRole("region", { name: "OpenRouter" })
    .getByRole("button", { name: "Load models" })
    .click();
  await dialog.getByRole("button", { name: /Vision and Reasoning/ }).click();
  await form
    .getByText("Set up a model and provider credentials before sending.")
    .waitFor();
  assert.equal(await send.isDisabled(), true);
  await selector.click();
  await dialog.getByRole("button", { name: "Open provider settings" }).click();
  await page
    .getByPlaceholder("Enter key for this session")
    .fill("mock-composer-key");
  await page.getByRole("button", { name: "Use key" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const reasoning = page.getByRole("button", {
    name: "Request reasoning",
    exact: true,
  });
  await reasoning.click();
  assert.equal(await reasoning.getAttribute("aria-pressed"), "true");
  assert.equal(await send.isEnabled(), true);
  assert.equal(await form.getByRole("button", { name: /^Tools/ }).count(), 0);
  if (process.env.COMPOSER_SCREENSHOTS) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await page.locator(".composer-wrap").screenshot({
          path: join(
            process.env.COMPOSER_SCREENSHOTS,
            `composer-${width}-${colorScheme}.png`,
          ),
        });
      }
    }
  }
  await selector.click();
  await dialog.getByRole("button", { name: /Basic Text/ }).click();
  assert.equal(await reasoning.count(), 0);
  assert.equal(await send.isDisabled(), true);
  await page.getByRole("button", { name: "Remove paste.png" }).click();
  assert.equal(await send.isEnabled(), true);
  await page.context().setOffline(true);
  await form.getByText(/You are offline/).waitFor();
  assert.equal(await send.isDisabled(), true);
  await input.fill("Still drafting offline");
  assert.equal(await input.inputValue(), "Still drafting offline");
  assert.equal(requests.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: adaptive composer, model capabilities, attachment inputs, IME guard, stop, independent drafts, and offline state",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
