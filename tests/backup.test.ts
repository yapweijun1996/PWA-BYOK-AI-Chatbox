import { describe, expect, it } from "vitest";
import { planBackupExport, readBackupFile } from "../src/backup";
import { validBackup } from "../src/data-contracts";
import { defaultSettings, type Conversation } from "../src/types";

const settings = { ...defaultSettings, projects: [{ id: "p", name: "项目" }] };
const file = {
  id: "a",
  name: "笔记.txt",
  mime: "text/plain",
  size: 6,
  data: "笔记",
};
const message = {
  id: "m",
  role: "user" as const,
  content: '📎 "\\\n',
  createdAt: 1,
  attachments: [file],
};
const chat = (id: string): Conversation => ({
  id,
  title: id,
  updatedAt: 1,
  projectId: "p",
  draft: "草稿",
  messages: [message],
});
const chats = [chat("a"), chat("b")];
const plan = (chats: Conversation[], limit?: number) =>
  planBackupExport(chats, settings, limit, "2026-01-01T00:00:00.000Z");

describe("portable v1 backup files", () => {
  it("retains the original draft and attachments while a message edit is active", async () => {
    const editing = {
      ...chat("edit"),
      editState: {
        sourceId: "m",
        originalDraft: "prior",
        originalAttachments: [file],
      },
    };
    expect(
      (await readBackupFile(plan([editing]).groups[0].blob)).conversations,
    ).toEqual([editing]);
    expect(
      validBackup({
        version: 1,
        conversations: [
          {
            ...editing,
            editState: {
              ...editing.editState,
              originalAttachments: [file, file],
            },
          },
        ],
      }),
    ).toBe(false);
  });
  it("uses the same exact byte boundary for import and export, including escaped and multibyte content", async () => {
    const full = plan(chats).groups[0].blob;
    expect(full.size).toBeGreaterThan((await full.text()).length);
    for (const limit of [full.size + 1, full.size]) {
      const { groups } = plan(chats, limit);
      expect(groups).toHaveLength(1);
      expect(
        (await readBackupFile(groups[0].blob, limit)).conversations,
      ).toEqual(chats);
    }
    const smaller = full.size - 1;
    await expect(readBackupFile(full, smaller)).rejects.toThrow(/limit/);
    const split = plan(chats, smaller);
    expect(split.groups).toHaveLength(2);
    expect(split.tooLarge).toEqual([]);
    const restored = await Promise.all(
      split.groups.map(({ blob }) => readBackupFile(blob, smaller)),
    );
    expect(restored.flatMap((group) => group.conversations)).toEqual(chats);
    for (const group of restored) {
      expect(group.projects).toEqual(settings.projects);
      expect(group.settings).not.toHaveProperty("vaults");
    }
  });

  it("names an indivisible conversation and still offers the other complete records", async () => {
    const budget = plan([chats[0]]).groups[0].blob.size;
    const large = { ...chat("large"), draft: "笔".repeat(budget) };
    const result = plan([large, chats[0]], budget);
    expect(result.tooLarge).toEqual(["large"]);
    expect(result.groups).toHaveLength(1);
    expect(
      (await readBackupFile(result.groups[0].blob, budget)).conversations,
    ).toEqual([chats[0]]);
    expect(plan([large], budget).groups).toHaveLength(0);
    expect(
      (await readBackupFile(plan([]).groups[0].blob)).conversations,
    ).toEqual([]);
  });

  it("rejects malformed records rather than treating them as local ID conflicts", () => {
    const c = chats[0];
    for (const conversations of [
      [c, c],
      [{ ...c, id: " " }],
      [{ ...c, messages: [message, message] }],
      [{ ...c, messages: [{ ...message, status: "finished" }] }],
      [{ ...c, messages: [{ ...message, attachments: [file, file] }] }],
      ...[
        { ...file, size: -1 },
        { ...file, size: 0.5 },
        { ...file, size: 0 },
        {
          ...file,
          mime: "image/jpeg",
          data: "data:image/png;base64,YQ==",
          size: 1,
        },
        {
          ...file,
          mime: "image/png",
          data: "data:image/png;base64,??==",
          size: 1,
        },
      ].map((a) => [{ ...c, draftAttachments: [a] }]),
    ])
      expect(validBackup({ version: 1, conversations })).toBe(false);
    expect(
      validBackup({
        version: 1,
        conversations: chats,
        projects: [settings.projects[0], settings.projects[0]],
      }),
    ).toBe(false);
    expect(validBackup({ version: 1, conversations: [c] })).toBe(true);
  });
});
