import { describe, expect, it } from "vitest";
import {
  cloudRecipient,
  needsHistoryChoice,
  portableConversation,
} from "../src/history-sharing";
import type { Conversation } from "../src/types";

const chat: Conversation = {
  id: "old",
  title: "Notes",
  updatedAt: 1,
  draft: "new draft",
  messages: [
    { id: "m1", role: "user", createdAt: 1, content: "previous note" },
  ],
};

describe("replaying chat history to a cloud provider", () => {
  it("does not gate local requests or a new chat with only a draft", () => {
    expect(needsHistoryChoice(chat, "lmstudio")).toBe(false);
    expect(needsHistoryChoice({ ...chat, messages: [] }, "openrouter")).toBe(
      false,
    );
  });
  it("requires a decision for existing history, except for the current approved recipient", () => {
    expect(needsHistoryChoice(chat, "openrouter")).toBe(true);
    const approved = {
      ...chat,
      cloudHistoryRecipient: cloudRecipient("openrouter"),
    };
    expect(needsHistoryChoice(approved, "openrouter")).toBe(false);
    expect(needsHistoryChoice(approved, "openai")).toBe(true);
    expect(
      needsHistoryChoice(
        { ...approved, cloudHistoryRecipient: cloudRecipient("lmstudio") },
        "openrouter",
      ),
    ).toBe(true);
  });
  it("never imports or exports permission with a portable conversation", () => {
    const portable = portableConversation({
      ...chat,
      cloudHistoryRecipient: "gemini",
    });
    expect(portable).toEqual(chat);
    expect(needsHistoryChoice(portable, "gemini")).toBe(true);
  });
});
