import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const requests = [];
const firstAnswer = Promise.withResolvers();
const moreReasoning = Promise.withResolvers();
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/v1/models") {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ data: [{ id: "reasoning-model" }] }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const isFirst = requests.length === 0;
    requests.push(JSON.parse(body));
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.write(
      'data: {"choices":[{"delta":{"reasoning_content":"Planning the answer."}}]}\n\n',
    );
    if (isFirst) {
      await moreReasoning.promise;
      if (!res.destroyed) res.write('data: {"choices":[{"delta":{"reasoning_content":" Latest reasoning update."}}]}\n\n');
      await firstAnswer.promise;
    }
    if (!res.destroyed) {
      const events = [
        {
          model: "served-reasoning-model",
          choices: [
            {
              delta: { content: "**The final answer.**" },
              finish_reason: "stop",
            },
          ],
        },
        {
          choices: [],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 21,
            total_tokens: 71,
            prompt_tokens_details: { cached_tokens: 0 },
            completion_tokens_details: { reasoning_tokens: 10 },
          },
        },
      ];
      res.end(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
          "data: [DONE]\n\n",
      );
    }
  });
});
await new Promise((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen),
);
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedMessage = text;
        },
      },
    }),
  );
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio" }).click();
  await applyServerAddress(page, `http://127.0.0.1:${server.address().port}/v1`);
  await page.getByLabel("Model ID").fill("reasoning-model");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("First message");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.locator("details.reasoning summary").waitFor();
  const reasoning = page.locator("details.reasoning").first();
  const preview = reasoning.locator(".reasoning-preview");
  await preview.getByText("Planning the answer.").waitFor();
  assert.equal(await reasoning.locator(".rich-message").getByText("Planning the answer.").isVisible(), false);
  assert.equal(await page.getByText("The final answer.").count(), 0);
  await page
    .locator("details.reasoning summary")
    .getByText("Generating")
    .waitFor();
  assert.match(await reasoning.locator("summary").getAttribute("aria-label"), /Response in progress/);
  assert.equal(await reasoning.locator(".reasoning-dots span").first().evaluate((element) => getComputedStyle(element).animationName), "reasoning-dot");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await reasoning.locator(".reasoning-dots span").first().evaluate((element) => getComputedStyle(element).animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  moreReasoning.resolve();
  await preview.getByText("Latest reasoning update.").waitFor();
  await page.locator("details.reasoning summary").click();
  assert.equal(await reasoning.locator(".rich-message").getByText("Planning the answer.").isVisible(), true);
  assert.equal(await preview.isVisible(), false);
  const inspector = page.locator(".response-inspector").first();
  const field = (name) =>
    inspector
      .locator("dl > div")
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator("dd")
      .first();
  await inspector.locator("summary").press("Enter");
  const explanationButton = inspector.getByRole("button", { name: "Explain metric sources" });
  await explanationButton.press("Enter");
  assert.equal(await explanationButton.getAttribute("aria-expanded"), "true");
  await inspector.getByText("Provider values come from the selected provider.", { exact: false }).waitFor();
  await explanationButton.press("Enter");
  assert.equal(await explanationButton.getAttribute("aria-expanded"), "false");
  assert.equal(await field("Provider").innerText(), "LM Studio");
  assert.equal(await field("Model").innerText(), "reasoning-model");
  assert.notEqual(await field("TTFT").innerText(), "N/A");
  const ttftSource = inspector.locator("dl > div").filter({ has: page.getByText("TTFT", { exact: true }) }).getByRole("note", { name: "Client measured" });
  assert.equal(await ttftSource.innerText(), "Client");
  assert.equal(await field("TTFV").innerText(), "N/A");
  assert.equal(await field("TPS").innerText(), "N/A");
  assert.equal(await field("Total tokens").innerText(), "N/A");
  const liveDuration = await field("Total duration").innerText();
  await page.waitForFunction(
    (last) =>
      [...document.querySelectorAll(".response-inspector dt")].find(
        (term) => term.textContent === "Total duration",
      )?.nextElementSibling?.textContent !== last,
    liveDuration,
  );
  const inspectorButton = page.getByRole("button", {
    name: "Workspace Inspector",
  });
  await inspectorButton.click();
  const liveModal = page.getByRole("dialog", { name: "Workspace Inspector" });
  await liveModal.getByText("streaming", { exact: true }).waitFor();
  await liveModal.getByRole("tab", { name: "Configuration" }).click();
  await liveModal.getByText("Active request snapshot").waitFor();
  assert.ok(
    await liveModal
      .getByText("stream_options.include_usage", { exact: true })
      .first()
      .isVisible(),
  );
  await page.keyboard.press("Escape");
  await liveModal.waitFor({ state: "hidden" });
  firstAnswer.resolve();
  await page.getByText("The final answer.").waitFor();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  assert.equal(
    await field("Served model").innerText(),
    "served-reasoning-model",
  );
  assert.notEqual(await field("TTFV").innerText(), "N/A");
  assert.notEqual(await field("TPS").innerText(), "N/A");
  assert.match(await inspector.locator(".response-explanation").innerText(), /Client estimate: reported output tokens/);
  await inspector.getByRole("note", { name: "Client estimate: reported output tokens ÷ time between first and last generated deltas" }).waitFor();
  assert.equal(await field("Total tokens").innerText(), "71");
  assert.equal(await field("Reasoning tokens").innerText(), "10");
  assert.equal(await field("Cached tokens").innerText(), "0");
  assert.equal(await field("Finish reason").innerText(), "stop");
  assert.equal(await field("Reasoning effort").innerText(), "N/A");
  assert.equal(
    await field("API cost (USD)").innerText(),
    "Local inference — no API charge",
  );
  const completedDuration = await field("Total duration").innerText();
  await reasoning.locator(".rich-message").getByText("Planning the answer.").waitFor();
  assert.equal(await reasoning.locator(".reasoning-progress").count(), 0);
  await page.waitForTimeout(500);
  await page.reload();
  await page.locator("details.reasoning summary").waitFor();
  assert.equal(await page.locator("details.reasoning .rich-message").getByText("Planning the answer.").isVisible(), false);
  await page.locator("details.reasoning .reasoning-preview").getByText("Latest reasoning update.").waitFor();
  await page.locator("details.reasoning summary").click();
  await page.locator("details.reasoning .rich-message").getByText("Planning the answer.").waitFor();
  await page.getByText("The final answer.").waitFor();
  await inspector.locator("summary").click();
  assert.equal(await field("Total duration").innerText(), completedDuration);
  assert.equal(await field("Total tokens").innerText(), "71");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Second message");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("The final answer.").nth(1).waitFor();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].stream_options, { include_usage: true });
  assert.ok(!JSON.stringify(requests[1]).includes("capturedAt"));
  assert.equal(
    JSON.stringify(requests[1]).includes("Planning the answer."),
    false,
  );
  assert.ok(!JSON.stringify(requests[1]).includes("served-reasoning-model"));
  const answer = page.locator(".message.assistant").first();
  await answer.getByRole("button", { name: "Copy", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.copiedMessage),
    "**The final answer.**",
  );
  await answer.evaluate((article) => {
    document.activeElement.blur();
    const range = document.createRange();
    range.selectNodeContents(article);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.addEventListener(
      "copy",
      (event) => {
        window.nativeMessageCopy = {
          text: event.clipboardData.getData("text/plain"),
          suppressed: event.defaultPrevented,
        };
      },
      { once: true },
    );
  });
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+C" : "Control+C",
  );
  await page.waitForFunction(() => Boolean(window.nativeMessageCopy));
  assert.deepEqual(
    await page.evaluate(() => {
      window.getSelection().removeAllRanges();
      return window.nativeMessageCopy;
    }),
    {
      text: "**The final answer.**",
      suppressed: true,
    },
  );
  const topModel = page.locator(".composer .model-pill");
  await topModel.click();
  await page.getByRole("dialog", { name: "Choose model" }).getByRole("button", { name: "Open provider settings" }).click();
  await page
    .getByRole("button", { name: "Use this model for the current chat" })
    .click();
  await page.getByLabel("Model ID").fill("changed-global-profile");
  await page.getByRole("button", { name: "Back to chat" }).click();
  assert.match(await topModel.getAttribute("title"), /reasoning-model/);
  await page.reload();
  assert.match(await topModel.getAttribute("title"), /reasoning-model/);
  await topModel.click();
  await page.getByRole("dialog", { name: "Choose model" }).getByRole("button", { name: "Open provider settings" }).click();
  assert.equal(
    await page.getByLabel("Model ID").inputValue(),
    "changed-global-profile",
  );
  await page
    .getByPlaceholder("Enter key for this session")
    .fill("credential-export-test-marker");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.setViewportSize({ width: 320, height: 650 });
  await page.emulateMedia({ colorScheme: "dark" });
  assert.ok(
    await inspector.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  );
  const openInspector = page.getByRole("button", {
    name: "Workspace Inspector",
  });
  await page.getByLabel("More actions").click();
  await openInspector.click();
  const modal = page.getByRole("dialog", { name: "Workspace Inspector" });
  await modal.getByRole("tab", { name: "Runtime" }).waitFor();
  const getTab = (name) => modal.getByRole("tab", { name, exact: true });
  await getTab("Runtime").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await getTab("Context").getAttribute("aria-selected"), "true");
  await getTab("Configuration").click();
  await modal.getByText("Historical request snapshot").waitFor();
  assert.equal(
    await modal.getByText("reasoning-model", { exact: true }).count(),
    2,
  );
  await modal
    .getByText("Conversation override", { exact: true })
    .first()
    .waitFor();
  await modal.getByText("Available for session", { exact: true }).waitFor();
  await getTab("Telemetry").click();
  await modal.getByText("Local inference — no API charge").waitFor();
  await getTab("Storage").click();
  await modal.getByText("luma-chat", { exact: true }).waitFor();
  await getTab("PWA").click();
  await modal.getByText("Page controlled by worker").waitFor();
  assert.equal(
    await modal.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    true,
  );
  const downloadEvent = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Export snapshot" }).click();
  const download = await downloadEvent;
  const reader = await download.createReadStream();
  let exported = "";
  for await (const chunk of reader) exported += chunk;
  const sections = JSON.parse(exported).sections;
  assert.equal(
    sections.Configuration["effective.provider"].source,
    "Conversation override",
  );
  assert.equal(sections.Configuration["historical.model"], undefined);
  assert.equal(sections.Telemetry.cachedTokens.value, 0);
  assert.equal(sections.Storage.savedCount.value, 1);
  assert.doesNotMatch(
    exported,
    /credential-export-test-marker|reasoning-model|The final answer|Planning the answer|127\.0\.0\.1/,
  );
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });
  assert.ok(
    await page.getByLabel("More actions").evaluate(
      (element) => element === document.activeElement,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: reasoning and trailing usage, raw message copy, effective and historical configuration after reload, six inspector tabs and sanitized export at 320px",
  );
} finally {
  moreReasoning.resolve();
  firstAnswer.resolve();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
}
