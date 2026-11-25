import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { onlyShellCache } from "./shell-cache.mjs";
import { chromePath } from "./browser-launch.mjs";
import { applyServerAddress } from "./provider-settings.mjs";

const requests = [];
const source =
  'console.log("sandbox", typeof fetch); ({ answer: 6 * 7, dom: typeof document, storage: typeof indexedDB, host: typeof postMessage })';
const secret = "test-only-credential-not-for-worker";
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url !== "/v1/chat/completions") return res.writeHead(404).end();
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  requests.push({ auth: req.headers.authorization, ...request });
  const last = request.messages.at(-1);
  const event = (choice) =>
    `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  if (last.role === "tool") {
    const result = JSON.parse(last.content);
    return res.end(
      event({
        delta: {
          content:
            result.status === "success"
              ? "The local result was 42."
              : `Execution returned ${result.status}.`,
        },
        finish_reason: "stop",
      }) + "data: [DONE]\n\n",
    );
  }
  if (last.content === "plain request")
    return res.end(
      event({
        delta: {
          content: "No tools for this reply.",
          tool_calls: [
            {
              index: 0,
              id: "unsolicited-1",
              type: "function",
              function: {
                name: "javascript_execute",
                arguments: '{"code":"42 * 2"}',
              },
            },
          ],
        },
        finish_reason: "stop",
      }) + "data: [DONE]\n\n",
    );
  const args = JSON.stringify({
    code: last.content === "stop request" ? "while (true) {}" : source,
  });
  const midpoint = Math.floor(args.length / 2);
  return res.end(
    [
      event({
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: {
                name: "javascript_execute",
                arguments: args.slice(0, midpoint),
              },
            },
          ],
        },
      }),
      event({
        delta: {
          tool_calls: [
            { index: 0, function: { arguments: args.slice(midpoint) } },
          ],
        },
      }),
      event({ delta: {}, finish_reason: "tool_calls" }),
      "data: [DONE]\n\n",
    ].join(""),
  );
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 320, height: 675 },
    locale: "en-US",
    colorScheme: "dark",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:55167/");
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await page.getByRole("button", { name: "Configure a provider" }).click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await applyServerAddress(
    page,
    `http://127.0.0.1:${server.address().port}/v1`,
  );
  await page.getByLabel("Model ID").fill("tool-model");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByPlaceholder("Enter key for this session").fill(secret);
  await page.getByRole("button", { name: "Use key", exact: true }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  const toggle = page.getByRole("button", {
    name: "Local tools",
  });
  const send = async (text) => {
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
  };
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await send("tool request");
  const tool = page.locator(".tool-execution").first();
  await tool.locator("summary").waitFor();
  await page.getByRole("button", { name: "Send message" }).waitFor();
  const toolResult = requests[1]?.messages.at(-1);
  assert.equal(toolResult?.role, "tool");
  assert.equal(toolResult.tool_call_id, "call_1");
  const parsed = JSON.parse(toolResult.content);
  assert.equal(parsed.status, "success", JSON.stringify(parsed));
  assert.deepEqual(parsed.console, [
    { level: "log", text: "sandbox undefined" },
  ]);
  assert.deepEqual(JSON.parse(parsed.value.text), {
    answer: 42,
    dom: "undefined",
    storage: "undefined",
    host: "undefined",
  });
  assert.equal(requests[0].auth, `Bearer ${secret}`);
  assert.equal(requests[0].tools[0].function.name, "javascript_execute");
  assert.equal(
    requests[1].messages.at(-2).tool_calls[0].function.arguments,
    JSON.stringify({ code: source }),
  );
  await page.getByText("The local result was 42.", { exact: true }).waitFor();
  assert.equal(await tool.getAttribute("data-status"), "success");
  await tool.locator("summary").click();
  assert.equal(await tool.getByLabel("JavaScript source").innerText(), source);
  await tool.getByLabel("Console output").waitFor();
  assert.match(
    await tool.getByLabel("Execution result").innerText(),
    /"answer":42/,
  );
  assert.ok(
    await tool.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  );
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await toggle.click();
  await page.getByText("Local tools disabled.", { exact: true }).waitFor();
  await page.reload();
  assert.equal(await toggle.getAttribute("aria-pressed"), "false");
  await send("plain request");
  await page.getByText("No tools for this reply.", { exact: true }).waitFor();
  assert.equal(requests[2].tools, undefined);
  assert.equal(await page.locator(".tool-execution").count(), 1);
  assert.ok(!JSON.stringify(requests[2].messages).includes("sandbox"));

  await toggle.click();
  await send("stop request");
  const stopped = page.locator('.tool-execution[data-status="running"]');
  await stopped.waitFor();
  await page.getByRole("button", { name: "Stop generating" }).click();
  await page.locator('.tool-execution[data-status="cancelled"]').waitFor();
  assert.equal(requests.length, 4);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await page.locator('.tool-execution[data-status="success"]').waitFor();
  await page.locator('.tool-execution[data-status="cancelled"]').waitFor();

  await page.context().setOffline(true);
  await page.reload();
  await page.locator('.tool-execution[data-status="success"]').waitFor();
  const offline = await page.evaluate(
    async (name) => {
      const response = await caches.open(name);
      const assets = (await response.keys()).map(({ url }) => url);
      const workerUrl = assets.find((url) =>
        /\/execute\.worker-.*\.js$/.test(url),
      );
      if (!workerUrl || !assets.some((url) => url.endsWith(".wasm")))
        throw new Error("Worker and WASM were not precached");
      const run = (code) =>
        new Promise((resolve) => {
          const worker = new Worker(workerUrl, { type: "module" });
          const timer = setTimeout(
            () => finish({ status: "unavailable" }),
            12500,
          );
          const finish = (result) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(result);
          };
          worker.onerror = (event) =>
            finish({ status: "worker-error", message: event.message });
          worker.onmessage = ({ data }) => {
            if (data.type === "result") finish(data.result);
          };
          worker.postMessage({ code });
        });
      return {
        globals: await run(
          `['fetch', 'WebSocket', 'XMLHttpRequest', 'document', 'navigator', 'indexedDB', 'localStorage', 'sessionStorage', 'caches', 'postMessage', 'importScripts', 'process', 'std', 'os', 'setTimeout'].map(name => typeof globalThis[name])`,
        ),
        timeout: await run('console.info("before"); for (;;) {}'),
        memory: await run(
          "const buffer = new Uint8Array(64 * 1024 * 1024); buffer.length",
        ),
        output: await run(
          'for (let i = 0; i < 100; i++) console.warn("x".repeat(2000)); "z".repeat(10000)',
        ),
        exception: await run('throw new Error("example failure")'),
        next: await run("typeof buffer"),
      };
    },
    await onlyShellCache(page),
  );
  assert.deepEqual(
    JSON.parse(offline.globals.value.text),
    Array(15).fill("undefined"),
  );
  assert.equal(offline.timeout.status, "timeout");
  assert.deepEqual(offline.timeout.console, [
    { level: "info", text: "before" },
  ]);
  assert.equal(
    offline.memory.error.code,
    "memory",
    JSON.stringify(offline.memory),
  );
  assert.equal(offline.output.status, "success");
  assert.equal(offline.output.truncated, true);
  assert.ok(
    offline.output.console.reduce(
      (total, entry) => total + entry.text.length,
      offline.output.value.text.length,
    ) <= 4096,
  );
  assert.match(offline.exception.error.message, /example failure/);
  assert.equal(offline.next.value.text, '"undefined"');
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual QuickJS/WASM in Chromium, model tool continuation, cancellation, IndexedDB restore, offline isolation and runtime limits",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
