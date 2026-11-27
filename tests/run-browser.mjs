import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const baseUrl = `http://127.0.0.1:${port}/`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (data) => (serverOutput += data));
server.stderr.on("data", (data) => (serverOutput += data));
let serverExit;
server.on("exit", (code) => {
  serverExit = code ?? -1;
});
async function ready() {
  for (let count = 0; count < 100; count++) {
    if (serverExit !== undefined)
      throw new Error(`Preview failed: ${serverOutput}`);
    try {
      const response = await fetch(baseUrl);
      if (
        response.ok &&
        stripVTControlCharacters(serverOutput).includes(baseUrl)
      )
        return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Preview did not start: ${serverOutput}`);
}
async function run(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      stdio: "inherit",
      env: { ...process.env, TEST_BASE_URL: baseUrl },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} failed (${code})`)),
    );
  });
}
try {
  await ready();
  for (const file of [
    "tests/startup-smoke.mjs",
    "tests/responsive-smoke.mjs",
    "tests/topbar-smoke.mjs",
    "tests/scrollbar-smoke.mjs",
    "tests/browser-smoke.mjs",
    "tests/anthropic-browser-smoke.mjs",
    "tests/branching-smoke.mjs",
    "tests/branch-isolation-smoke.mjs",
    "tests/search-branches-smoke.mjs",
    "tests/reasoning-smoke.mjs",
    "tests/tool-execution-smoke.mjs",
    "tests/openai-luna-smoke.mjs",
    "tests/responses-errors-smoke.mjs",
    "tests/reasoning-effort-smoke.mjs",
    "tests/composer-effort-vault-smoke.mjs",
    "tests/composer-mobile-alignment-smoke.mjs",
    "tests/local-tools-smoke.mjs",
    "tests/rich-message-smoke.mjs",
    "tests/long-conversation-smoke.mjs",
    "tests/web-preview-smoke.mjs",
    "tests/composer-smoke.mjs",
    "tests/slash-commands-smoke.mjs",
    "tests/pages-subpath.mjs",
    "tests/update-smoke.mjs",
    "tests/ui-preferences.mjs",
    "tests/workspace-smoke.mjs",
  ])
    await run(file);
} finally {
  server.kill();
}
