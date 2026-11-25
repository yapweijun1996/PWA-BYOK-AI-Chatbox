import { describe, expect, it } from "vitest";
import { mergeSettings, validBackup } from "../src/data-contracts";
import { restoreConversations } from "../src/startup";
import {
  groupConversations,
  groupRecentByDate,
  mergeProjects,
  normalizeSidebarWidth,
  searchConversations,
  searchWorkspace,
} from "../src/workspace";
import type { Conversation } from "../src/types";

const project = { id: "research", name: "Research" };
const chat = (id: string, patch: Partial<Conversation> = {}): Conversation => ({
  id,
  title: id,
  updatedAt: 1,
  draft: "",
  messages: [],
  ...patch,
});

describe("workspace data contracts", () => {
  it("groups recent conversations using local calendar dates without losing invalid or future dates", () => {
    const now = new Date(2026, 2, 15, 12);
    const midnight = new Date(2026, 2, 15).getTime();
    const boundary = new Date(2026, 2, 8).getTime();
    const items = [
      chat("future", { updatedAt: new Date(2026, 2, 16).getTime() }),
      chat("today", { updatedAt: midnight }),
      chat("yesterday", { updatedAt: midnight - 1 }),
      chat("boundary", { updatedAt: boundary }),
      chat("older", { updatedAt: boundary - 1 }),
      chat("invalid", { updatedAt: NaN }),
    ];
    const groups = groupRecentByDate(items, now);
    expect(groups.Future.map((item) => item.id)).toEqual(["future"]);
    expect(groups.Today.map((item) => item.id)).toEqual(["today"]);
    expect(groups["Previous 7 days"].map((item) => item.id)).toEqual([
      "yesterday",
      "boundary",
    ]);
    expect(groups.Earlier.map((item) => item.id)).toEqual(["older", "invalid"]);
    expect(Object.values(groups).flat()).toHaveLength(items.length);
  });
  it("classifies archived, pinned, project and recent chats without duplicating or hiding history", () => {
    const archived = chat("archived", {
      archived: true,
      pinned: true,
      projectId: project.id,
    });
    const pinned = chat("pinned", { pinned: true, projectId: project.id });
    const filed = chat("filed", { projectId: project.id });
    const orphan = chat("orphan", { projectId: "missing", updatedAt: 2 });
    const old = chat("old");
    const groups = groupConversations(
      [old, filed, archived, orphan, pinned],
      [project],
    );
    expect(groups.pinned).toEqual([pinned]);
    expect(groups.folders.get(project.id)).toEqual([filed]);
    expect(groups.recent).toEqual([orphan, old]);
    expect(groups.counts.get(project.id)).toBe(3);
    expect(restoreConversations([old, archived], null).active).toBe(old.id);
  });

  it("searches locally by text, title and project within the selected archive scope", () => {
    const a = chat("a", { projectId: project.id });
    const b = chat("b", {
      title: "Outline",
      archived: true,
      messages: [
        { id: "m", role: "assistant", content: "Buried keyword", createdAt: 1 },
      ],
    });
    expect(searchConversations([a, b], "reSEArch", false, [project])).toEqual([
      a,
    ]);
    expect(searchConversations([a, b], "keyword", false, [project])).toEqual(
      [],
    );
    expect(searchConversations([a, b], "keyword", true, [project])).toEqual([
      b,
    ]);
  });

  it("returns separate, bounded message hits without duplicating shared messages", () => {
    const c = chat("c", {
      title: "needle topic",
      messages: [
        {
          id: "shared",
          role: "user",
          content: `prefix ${"x".repeat(200)} needle shared suffix`,
          createdAt: 1,
        },
        { id: "a", role: "assistant", content: "needle one", createdAt: 2 },
        { id: "b", role: "assistant", content: "needle two", createdAt: 3 },
      ],
    });
    const results = searchWorkspace([c], "NEEDLE", false, []);
    expect(results.map((entry) => entry.message?.id ?? "conversation")).toEqual(
      ["conversation", "shared", "a", "b"],
    );
    expect(results[1].snippet).toContain("needle shared");
    expect(results[1].snippet!.length).toBeLessThanOrEqual(162);
    expect(searchWorkspace([c], "", false, [])).toEqual([{ chat: c }]);
    expect(searchWorkspace([c], "needle", false, [], 2)).toHaveLength(2);
    expect(searchWorkspace([c], "needle", false, [], 0)).toEqual([]);
  });

  it("restores bounded preferences and accepts existing version-1 backups", () => {
    expect(mergeSettings(undefined)).toMatchObject({
      sidebarCollapsed: false,
      sidebarWidth: 264,
      projects: [],
    });
    expect(
      mergeSettings({
        sidebarWidth: 999,
        sidebarCollapsed: true,
        projects: [project],
      }),
    ).toMatchObject({
      sidebarWidth: 440,
      sidebarCollapsed: true,
      projects: [project],
    });
    expect(normalizeSidebarWidth(-1)).toBe(224);
    expect(normalizeSidebarWidth(NaN)).toBe(264);
    const backup = { version: 1, conversations: [chat("original")] };
    expect(validBackup(backup)).toBe(true);
    expect(
      validBackup({
        ...backup,
        projects: [project],
        conversations: [chat("filed", { projectId: project.id, pinned: true })],
      }),
    ).toBe(true);
    expect(validBackup({ ...backup, projects: [{ id: "x", name: "" }] })).toBe(
      false,
    );
    expect(
      validBackup({
        ...backup,
        conversations: [{ ...chat("x"), archived: "true" }],
      }),
    ).toBe(false);
    expect(
      mergeProjects([project], [{ id: project.id, name: "Imported name" }]),
    ).toEqual([project]);
  });
});
