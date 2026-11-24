import { chromium } from "playwright-core";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const requests = [];
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
  req.on("end", () => {
    requests.push(JSON.parse(body));
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.write(
      'data: {"choices":[{"delta":{"reasoning_content":"Planning the answer."}}]}\n\n',
    );
    setTimeout(() => {
      if (!res.destroyed)
        res.end(
          'data: {"choices":[{"delta":{"content":"The final answer."}}]}\n\ndata: [DONE]\n\n',
        );
    }, 1200);
  });
});
await new Promise((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen),
);
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio" }).click();
  await page
    .getByLabel("Server base URL")
    .fill(`http://127.0.0.1:${server.address().port}/v1`);
  await page.getByLabel("Model ID").fill("reasoning-model");
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("First message");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Planning the answer.").waitFor();
  assert.equal(await page.getByText("The final answer.").count(), 0);
  await page
    .locator("details.reasoning summary")
    .getByText("Thinking…")
    .waitFor();
  await page.locator("details.reasoning summary").click();
  assert.equal(await page.getByText("Planning the answer.").isVisible(), false);
  await page.getByText("The final answer.").waitFor();
  await page.locator("details.reasoning summary").click();
  await page.getByText("Planning the answer.").waitFor();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByText("Planning the answer.").waitFor();
  await page.getByText("The final answer.").waitFor();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Second message");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("The final answer.").nth(1).waitFor();
  assert.equal(requests.length, 2);
  assert.equal(
    JSON.stringify(requests[1]).includes("Planning the answer."),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live SSE reasoning displayed before answer, collapsible, persisted, and excluded from later requests",
  );
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
