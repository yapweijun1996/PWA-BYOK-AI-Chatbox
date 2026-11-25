import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { chromePath } from "./browser-launch.mjs";

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 750 }, locale: "en-US" });
  const requests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://api.openai.com/v1/**", async (route) => {
    const request = route.request();
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.url().endsWith("/models")) return route.fulfill({ headers, json: { data: [{ id: "gpt-6-luna" }] } });
    const body = request.postDataJSON();
    requests.push(body);
    if (body.tools && body.reasoning_effort !== "none") return route.fulfill({ status: 400, headers, json: { error: { message: "Function tools with reasoning_effort are not supported for gpt-6-luna in /v1/chat/completions.", param: "reasoning_effort" } } });
    const event = (choice) => `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
    const last = body.messages.at(-1);
    const choice = last.role === "tool"
      ? { delta: { content: "The result is 2." }, finish_reason: "stop" }
      : body.tools
        ? { delta: { tool_calls: [{ index: 0, id: "call_luna", type: "function", function: { name: "calculate", arguments: '{"expression":"1+1"}' } }] }, finish_reason: "tool_calls" }
        : { delta: { content: "Tools are off." }, finish_reason: "stop" };
    return route.fulfill({ headers: { ...headers, "Content-Type": "text/event-stream" }, body: event(choice) + "data: [DONE]\n\n" });
  });
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "OpenAI", exact: true }).click();
  await page.getByLabel("Model ID").fill("gpt-6-luna");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByPlaceholder("Enter key for this session").fill("test-only-key");
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const form = page.locator(".composer");
  const hint = form.getByText("GPT-6 Luna uses reasoning effort none when local tools are enabled.", { exact: false });
  await hint.waitFor();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  assert.match(await input.getAttribute("aria-describedby"), new RegExp(await hint.getAttribute("id")));
  await input.fill("Calculate 1+1");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("The result is 2.").waitFor();
  assert.equal(requests.length, 2);
  assert.ok(requests.every((body) => body.reasoning_effort === "none" && body.tools.length > 0));
  assert.equal(requests[1].messages.at(-1).role, "tool");
  await form.getByRole("button", { name: "Local tools" }).click();
  assert.equal(await hint.count(), 0);
  await input.fill("Answer without tools");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Tools are off.").waitFor();
  assert.equal(requests.length, 3);
  assert.equal("reasoning_effort" in requests[2], false);
  assert.equal("tools" in requests[2], false);
  assert.deepEqual(errors, []);
  console.log("PASS: OpenAI GPT-6 Luna tool request, tool continuation, compatibility notice and tools-off request");
} finally {
  await browser.close();
}
