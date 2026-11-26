import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1000, height: 740 },
  });
  const requests = [];
  await page.route("https://api.anthropic.com/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (request.url().endsWith("/models"))
      return route.fulfill({
        headers,
        json: { data: [{ id: "claude-test", display_name: "Claude Test" }] },
      });
    requests.push({ headers: request.headers(), body: request.postDataJSON() });
    const events = [
      {
        type: "message_start",
        message: { model: "claude-test", usage: { input_tokens: 3 } },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: `Claude reply ${requests.length}` },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 3 },
      },
      { type: "message_stop" },
    ];
    return route.fulfill({
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(""),
    });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "Anthropic", exact: true }).click();
  await page.getByLabel("Model ID").fill("claude-test");
  await page
    .getByPlaceholder("Enter API key or token")
    .fill("mock-anthropic-key");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Hello Claude");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Claude reply 1", { exact: true }).waitFor();
  const user = page.locator(".message.user").first();
  assert.ok(await user.locator("time").getAttribute("datetime"));
  assert.ok(await user.locator("time").getAttribute("title"));
  assert.equal(requests[0].headers["x-api-key"], "mock-anthropic-key");
  assert.equal(
    requests[0].headers["anthropic-dangerous-direct-browser-access"],
    "true",
  );
  assert.equal(requests[0].body.messages[0].content[0].text, "Hello Claude");
  await page.getByText("Saved locally", { exact: true }).last().waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const retryDialog = page.getByRole("dialog", { name: "Retry reply?" });
  await retryDialog.getByText("Anthropic · claude-test").first().waitFor();
  const currentRadio = retryDialog.getByRole("radio", { name: /Current model/ });
  const originalRadio = retryDialog.getByRole("radio", { name: /Original model/ });
  await currentRadio.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await originalRadio.isChecked(), true);
  assert.equal(await originalRadio.locator("..").getAttribute("data-selected"), "true");
  await retryDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert.equal(requests.length, 1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await retryDialog
    .getByRole("button", { name: "Retry reply", exact: true })
    .click();
  await page.getByText("Claude reply 2", { exact: true }).waitFor();
  assert.equal(requests[1].body.messages.length, 1);
  assert.equal(
    await page.getByText("Claude reply 1", { exact: true }).count(),
    0,
  );
  await page.getByText("Saved locally", { exact: true }).last().waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Anthropic", exact: true }).click();
  await page.getByLabel("Model ID").fill("claude-new");
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await retryDialog
    .getByText("Anthropic · claude-new", { exact: true })
    .waitFor();
  await retryDialog.getByText("Original model", { exact: true }).click();
  await retryDialog
    .getByRole("button", { name: "Retry reply", exact: true })
    .click();
  await page.getByText("Claude reply 3", { exact: true }).waitFor();
  assert.equal(requests[2].body.messages.length, 1);
  assert.equal(requests[2].body.model, "claude-test");
  await page.getByText("Saved locally", { exact: true }).last().waitFor();
  await input.fill("Previous draft");
  await page
    .locator('.composer input[type="file"]')
    .setInputFiles({
      name: "keep.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("saved file"),
    });
  await page.getByRole("button", { name: "Remove keep.txt" }).waitFor();
  await user.getByRole("button", { name: "Edit as new message" }).click();
  await page
    .getByRole("dialog", { name: "Replace current draft?" })
    .getByRole("button", { name: "Edit message", exact: true })
    .click();
  await input.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".composer textarea")?.value === "Hello Claude",
  );
  assert.equal(
    await user.getByText("Hello Claude", { exact: true }).count(),
    1,
  );
  await page.reload();
  await page
    .getByText("Editing a previous message. The original stays in the chat.")
    .waitFor();
  assert.equal(await input.inputValue(), "Hello Claude");
  await page.getByRole("button", { name: "Cancel edit" }).click();
  assert.equal(await input.inputValue(), "Previous draft");
  await page.getByRole("button", { name: "Remove keep.txt" }).waitFor();
  await user.getByRole("button", { name: "Edit as new message" }).click();
  await page
    .getByRole("dialog", { name: "Replace current draft?" })
    .getByRole("button", { name: "Edit message", exact: true })
    .click();
  await input.fill("Changed draft");
  await user.getByRole("button", { name: "Edit as new message" }).click();
  await page
    .getByRole("dialog", { name: "Replace current draft?" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert.equal(await input.inputValue(), "Changed draft");
  await page.getByRole("button", { name: "Cancel edit" }).click();
  assert.equal(await input.inputValue(), "Previous draft");
  console.log(
    "PASS: Anthropic direct streaming, reply retry, message timestamps and non-destructive editing",
  );
} finally {
  await browser.close();
}
