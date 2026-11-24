import { describe, expect, it } from "vitest";
import { canTransition, restoreConversations } from "../src/startup";
import type { Conversation } from "../src/types";

const old: Conversation = {
  id: "selected",
  title: "Selected chat",
  draft: "An unsent draft",
  updatedAt: 1,
  draftAttachments: [
    {
      id: "file",
      name: "notes.txt",
      mime: "text/plain",
      data: "notes",
      size: 5,
    },
  ],
  messages: [
    {
      id: "message",
      role: "assistant",
      status: "streaming",
      content: "Partial reply",
      createdAt: 1,
    },
  ],
};
const recent: Conversation = {
  id: "recent",
  title: "Recent chat",
  draft: "Other draft",
  updatedAt: 2,
  messages: [],
};

describe("startup lifecycle", () => {
  it("cannot reveal or become ready before mount and verification", () => {
    expect(canTransition("loading", "mounting")).toBe(false);
    expect(canTransition("restoring", "revealing")).toBe(false);
    expect(canTransition("mounting", "ready")).toBe(false);
    expect(canTransition("verifying", "revealing")).toBe(true);
    expect(canTransition("revealing", "ready")).toBe(true);
    expect(canTransition("failed", "restoring")).toBe(true);
    expect(canTransition("ready", "failed")).toBe(false);
  });

  it("restores the selected conversation and draft without changing stored messages", () => {
    const saved = restoreConversations([old, recent], old.id);
    expect(saved.active).toBe(old.id);
    expect(saved.threads.map(({ id }) => id)).toEqual([recent.id, old.id]);
    expect(saved.threads[1]).toMatchObject({
      draft: old.draft,
      draftAttachments: old.draftAttachments,
      messages: [{ status: "interrupted", content: "Partial reply" }],
    });
    expect(old.messages[0].status).toBe("streaming");
  });

  it("falls back to the most recent chat or the empty state for legacy and stale selections", () => {
    expect(restoreConversations([old, recent], undefined).active).toBe(
      recent.id,
    );
    expect(restoreConversations([old, recent], "deleted").active).toBe(
      recent.id,
    );
    expect(restoreConversations([], "deleted")).toEqual({
      threads: [],
      active: "",
    });
  });
});
