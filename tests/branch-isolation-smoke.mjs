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
  const bodies = [];
  await page.route("http://localhost:1234/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON();
    bodies.push(body);
    const last = body.messages.at(-1);
    const choice =
      last.role === "tool"
        ? { delta: { content: "Isolation checked" }, finish_reason: "stop" }
        : {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "branch-file-call",
                  type: "function",
                  function: {
                    name: "analyze_file",
                    arguments: '{"action":"list"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          };
    return route.fulfill({
      headers: { ...headers, "Content-Type": "text/event-stream" },
      body: `data: ${JSON.stringify({ choices: [choice] })}\n\ndata: [DONE]\n\n`,
    });
  });
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:55167/";
  await page.goto(base);
  await page.locator('html[data-startup="ready"]').waitFor();
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("luma-chat");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["settings", "conversations"], "readwrite");
          tx.objectStore("conversations").put({
            id: "isolation",
            title: "Isolation",
            updatedAt: 1,
            draft: "",
            branchVersion: 1,
            activeMessageId: "visible-answer",
            preferredBranches: {
              "": "root",
              root: "answer",
              answer: "visible",
              visible: "visible-answer",
              hidden: "hidden-answer",
            },
            messages: [
              {
                id: "root",
                parentId: null,
                role: "user",
                content: "Common prompt",
                createdAt: 1,
                status: "complete",
              },
              {
                id: "answer",
                parentId: "root",
                role: "assistant",
                content: "Common answer",
                createdAt: 2,
                status: "complete",
              },
              {
                id: "hidden",
                parentId: "answer",
                role: "user",
                content: "Hidden branch secret",
                createdAt: 3,
                status: "complete",
                attachments: [
                  {
                    id: "secret",
                    name: "hidden-secret.txt",
                    mime: "text/plain",
                    size: 11,
                    data: "secret-data",
                  },
                ],
              },
              {
                id: "hidden-answer",
                parentId: "hidden",
                role: "assistant",
                content: "Hidden answer",
                createdAt: 4,
                status: "complete",
              },
              {
                id: "visible",
                parentId: "answer",
                role: "user",
                content: "Visible branch",
                createdAt: 5,
                status: "complete",
                attachments: [
                  {
                    id: "visible-file",
                    name: "visible.txt",
                    mime: "text/plain",
                    size: 4,
                    data: "safe",
                  },
                ],
              },
              {
                id: "visible-answer",
                parentId: "visible",
                role: "assistant",
                content: "Visible answer",
                createdAt: 6,
                status: "complete",
              },
            ],
          });
          tx.objectStore("settings").put("isolation", "activeConversation");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.getByText("Visible answer", { exact: true }).waitFor();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "LM Studio", exact: true }).click();
  await page.getByLabel("Model ID").fill("branch-tools");
  await page.getByRole("button", { name: "Set as default provider" }).click();
  await page.getByRole("button", { name: "Back to chat" }).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("List files");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Isolation checked", { exact: true }).waitFor();
  assert.equal(bodies.length, 2);
  const allRequests = JSON.stringify(bodies);
  assert.doesNotMatch(
    allRequests,
    /Hidden branch secret|hidden-secret\.txt|secret-data/,
  );
  const result = JSON.parse(bodies[1].messages.at(-1).content);
  assert.match(JSON.stringify(result), /visible\.txt/);
  assert.doesNotMatch(JSON.stringify(result), /hidden-secret/);
  console.log(
    "PASS: hidden branch messages and attachments stay out of provider and local tool context",
  );
} finally {
  await browser.close();
}
