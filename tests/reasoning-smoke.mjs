import { chromePath } from "./browser-launch.mjs";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const requests = [];
const firstAnswer = Promise.withResolvers();
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
    if (isFirst) await firstAnswer.promise;
    if (!res.destroyed) {
      const events = [
        {
          model: "served-reasoning-model",
          choices: [
            { delta: { content: "The final answer." }, finish_reason: "stop" },
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
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
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
  const inspector = page.locator(".response-inspector").first();
  const field = (name) =>
    inspector
      .locator("dl > div")
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator("dd")
      .first();
  await inspector.locator("summary").press("Enter");
  assert.equal(await field("Provider").innerText(), "LM Studio");
  assert.equal(await field("Model").innerText(), "reasoning-model");
  assert.notEqual(await field("TTFT").innerText(), "N/A");
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
  firstAnswer.resolve();
  await page.getByText("The final answer.").waitFor();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  assert.equal(
    await field("Served model").innerText(),
    "served-reasoning-model",
  );
  assert.notEqual(await field("TTFV").innerText(), "N/A");
  assert.notEqual(await field("TPS").innerText(), "N/A");
  assert.equal(await field("Total tokens").innerText(), "71");
  assert.equal(await field("Reasoning tokens").innerText(), "10");
  assert.equal(await field("Cached tokens").innerText(), "0");
  assert.equal(await field("Finish reason").innerText(), "stop");
  assert.equal(await field("Reasoning effort").innerText(), "N/A");
  assert.equal(await field("API cost (USD)").innerText(), "N/A");
  const completedDuration = await field("Total duration").innerText();
  await page.locator("details.reasoning summary").click();
  await page.getByText("Planning the answer.").waitFor();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByText("Planning the answer.").waitFor();
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
  assert.equal(
    JSON.stringify(requests[1]).includes("Planning the answer."),
    false,
  );
  assert.ok(!JSON.stringify(requests[1]).includes("served-reasoning-model"));
  await page.setViewportSize({ width: 320, height: 650 });
  await page.emulateMedia({ colorScheme: "dark" });
  assert.ok(
    await inspector.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live reasoning, response telemetry, 320px inspector, and reasoning/telemetry persistence without request leakage",
  );
} finally {
  firstAnswer.resolve();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
}
