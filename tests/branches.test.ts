import { describe, expect, it } from "vitest";
import {
  activePath,
  activateBranch,
  asBranchConversation,
  branchDescendants,
  pathTo,
  removeBranch,
  selectBranch,
  siblings,
  validBranchConversation,
} from "../src/branches";
import { validBackup } from "../src/data-contracts";
import {
  needsHistoryChoice,
  portableConversation,
} from "../src/history-sharing";
import type { Conversation, Message } from "../src/types";
import { defaultSettings } from "../src/types";
import { planBackupExport, readBackupFile } from "../src/backup";

const msg = (
  id: string,
  role: Message["role"],
  status: Message["status"] = "complete",
): Message => ({ id, role, status, content: id, createdAt: 1 });
const old: Conversation = {
  id: "c",
  title: "test",
  updatedAt: 1,
  draft: "",
  messages: [
    msg("u", "user"),
    msg("a", "assistant"),
    msg("b", "assistant"),
    msg("u2", "user"),
    msg("c", "assistant"),
  ],
};
describe("message branches", () => {
  it("migrates legacy retries without losing them or including them together in the active path", () => {
    const tree = asBranchConversation(old);
    expect(tree.messages).toHaveLength(5);
    expect(activePath(tree).map((m) => m.id)).toEqual(["u", "b", "u2", "c"]);
    expect(siblings(tree, tree.messages[1]).map((m) => m.id)).toEqual([
      "a",
      "b",
    ]);
    expect(activePath(selectBranch(tree, "a")).map((m) => m.id)).toEqual([
      "u",
      "a",
    ]);
    expect(
      activePath(selectBranch(selectBranch(tree, "a"), "b")).map((m) => m.id),
    ).toEqual(["u", "b", "u2", "c"]);
    expect(validBranchConversation(tree)).toBe(true);
  });
  it("preserves successful context after a failed legacy retry", () => {
    const tree = asBranchConversation({
      ...old,
      messages: [
        msg("u", "user"),
        msg("a", "assistant"),
        msg("failed", "assistant", "error"),
        msg("next", "user"),
      ],
    });
    expect(activePath(tree).map((m) => m.id)).toEqual(["u", "a", "next"]);
    expect(activePath(selectBranch(tree, "failed")).map((m) => m.id)).toEqual([
      "u",
      "failed",
    ]);
  });
  it("removes a subtree, selects a surviving sibling, and keeps other content", () => {
    const tree = asBranchConversation(old);
    expect([...branchDescendants(tree, "b")]).toEqual(["b", "u2", "c"]);
    const result = removeBranch(tree, "b");
    expect(result.messages.map((m) => m.id)).toEqual(["u", "a"]);
    expect(activePath(result).map((m) => m.id)).toEqual(["u", "a"]);
    expect(validBranchConversation(result)).toBe(true);
  });
  it("validates branch references and requires v2 backups", () => {
    const tree = asBranchConversation(old);
    expect(validBackup({ version: 1, conversations: [tree] })).toBe(false);
    expect(validBackup({ version: 2, conversations: [tree] })).toBe(true);
    expect(
      validBackup({
        version: 2,
        conversations: [
          {
            ...tree,
            messages: tree.messages.map((m) =>
              m.id === "u" ? { ...m, parentId: "c" } : m,
            ),
          },
        ],
      }),
    ).toBe(false);
    expect(() => pathTo(tree, "missing")).toThrow();
    expect(activePath(activateBranch(tree, "u")).map((m) => m.id)).toEqual([
      "u",
    ]);
  });
  it("round-trips a v2 backup without transferring branch sharing consent", async () => {
    const tree = {
      ...asBranchConversation(old),
      cloudHistoryRecipient: "openai" as const,
      cloudHistoryKnownIds: ["u", "a"],
    };
    const backup = await readBackupFile(
      planBackupExport([tree], defaultSettings).groups[0].blob,
    );
    expect(backup.version).toBe(2);
    expect(backup.conversations[0]).toEqual(portableConversation(tree));
    expect(
      activePath(backup.conversations[0]).map((message) => message.id),
    ).toEqual(["u", "b", "u2", "c"]);
  });
  it("asks before sharing a previously unseen branch and never exports local consent", () => {
    const tree = {
      ...asBranchConversation(old),
      cloudHistoryRecipient: "openai" as const,
      cloudHistoryKnownIds: ["u", "b", "u2", "c"],
    };
    expect(needsHistoryChoice(tree, "openai")).toBe(false);
    expect(needsHistoryChoice(selectBranch(tree, "a"), "openai")).toBe(true);
    expect(portableConversation(tree)).not.toHaveProperty(
      "cloudHistoryKnownIds",
    );
  });
});
