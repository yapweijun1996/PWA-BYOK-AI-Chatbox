import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 750 },
    locale: "en-US",
  });
  const results = [];
  const definitions = [];
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON();
    const last = body.messages.at(-1);
    const event = (choice) =>
      `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
    if (last.role === "tool") {
      results.push(JSON.parse(last.content));
      return route.fulfill({
        headers: { ...headers, "Content-Type": "text/event-stream" },
        body:
          event({
            delta: { content: "Tool finished" },
            finish_reason: "stop",
          }) + "data: [DONE]\n\n",
      });
    }
    definitions.push(body.tools.map(({ function: fn }) => fn.name));
    const message =
      typeof last.content === "string" ? last.content : last.content[0].text;
    let name;
    let args;
    if (message.startsWith("badzone")) {
      name = "time_tool";
      args = { action: "now", timezone: "Invalid/Zone" };
    } else if (message.startsWith("regex")) {
      name = "text_tool";
      args = { action: "extract", text: "item 12 and 34", search: "[0-9]+" };
    } else if (message.startsWith("filemissing")) {
      name = "analyze_file";
      args = { file: "missing.csv", action: "read" };
    } else if (message.startsWith("memlist")) {
      name = "memory_tool";
      args = { action: "list" };
    } else if (message.startsWith("clock")) {
      name = "time_tool";
      args = {
        action: "convert",
        date: "2026-01-01T00:00:00Z",
        timezone: "Asia/Singapore",
      };
    } else if (message.startsWith("math")) {
      name = "calculate";
      args = { expression: "6 * 7" };
    } else if (message.startsWith("file")) {
      name = "analyze_file";
      args = { file: "sample.csv", action: "summary" };
    } else if (message.startsWith("text")) {
      name = "text_tool";
      args = { action: "unique", text: "a\nb\na" };
    } else if (message.startsWith("remember")) {
      name = "memory_tool";
      args = { action: "save", key: "color", value: "blue" };
    } else {
      name = "memory_tool";
      args = { action: "get", key: "color" };
    }
    return route.fulfill({
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body:
        event({
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          finish_reason: "tool_calls",
        }) + "data: [DONE]\n\n",
    });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID").fill("tools-test");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  async function send(prompt) {
    const index = results.length;
    await input.fill(prompt);
    await page.getByRole("button", { name: "Send message" }).click();
    await page.getByText("Tool finished", { exact: true }).nth(index).waitFor();
  }
  await send("clock");
  assert.match(results[0].value.text, /Singapore/);
  await send("math");
  assert.equal(results[1].value.text, "42");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "sample.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,value\na,1\nb,2\n"),
    });
  await page.getByText("sample.csv").waitFor();
  await send("file");
  assert.equal(JSON.parse(results[2].value.text).rows, 3);
  await send("text");
  assert.equal(JSON.parse(results[3].value.text), "a\nb");
  await send("remember");
  assert.equal(JSON.parse(results[4].value.text).saved, true);
  await send("recall");
  assert.deepEqual(JSON.parse(results[5].value.text), {
    key: "color",
    value: "blue",
  });
  await send("regex");
  assert.deepEqual(JSON.parse(results[6].value.text), ["12", "34"]);
  await send("badzone");
  assert.equal(results[7].status, "error");
  await send("filemissing");
  assert.equal(results[8].status, "error");
  await send("memlist");
  assert.deepEqual(JSON.parse(results[9].value.text).keys, ["color"]);
  assert.deepEqual(definitions[0], [
    "javascript_execute",
    "time_tool",
    "calculate",
    "analyze_file",
    "text_tool",
    "memory_tool",
  ]);
  await page.reload();
  await page.locator('html[data-startup="ready"]').waitFor();
  assert.equal(await page.locator(".tool-execution").count(), 10);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Local data", exact: true }).click();
  await page.getByText("blue", { exact: true }).waitFor();
  const row = page.locator(".memory-list li").filter({ hasText: "color" });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Memory value").fill("green");
  await page.getByRole("button", { name: "Save memory" }).click();
  await row.getByText("green", { exact: true }).waitFor();
  await row.getByRole("button", { name: "Delete" }).click();
  await row.waitFor({ state: "detached" });
  await page.getByLabel("Memory key").fill("delete-with-workspace");
  await page.getByLabel("Memory value").fill("test");
  await page.getByRole("button", { name: "Save memory" }).click();
  await page.getByText("delete-with-workspace", { exact: true }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear all local data" }).click();
  await page.getByText("Local data cleared.", { exact: true }).waitFor();
  await page.getByText("delete-with-workspace", { exact: true }).waitFor({ state: "detached" });
  console.log(
    "PASS: five local tools, provider continuation, attachments, persistence and memory management",
  );
} finally {
  await browser.close();
}
