import { backupPreferences, validBackup } from "./data-contracts";
import { portableConversation } from "./history-sharing";
import type { Conversation, Settings } from "./types";

export const backupByteLimit = 100 * 1024 * 1024;
export type ExportPlan = {
  groups: { blob: Blob; count: number }[];
  tooLarge: string[];
  omittedServerAddress: boolean;
};

// Each group is a standalone v1 file. Count the bytes we actually download,
// including escaped text, separators and the metadata repeated in each file.
export function planBackupExport(
  chats: Conversation[],
  settings: Settings,
  limit = backupByteLimit,
  exportedAt = new Date().toISOString(),
): ExportPlan {
  const { preferences, omittedServerAddress } = backupPreferences(settings);
  const projects = settings.projects.map(({ id, name }) => ({ id, name }));
  if (
    !validBackup({
      version: 1,
      projects,
      settings: preferences,
      conversations: chats,
    })
  )
    throw new Error(
      "Cannot create a restorable backup: invalid workspace records. No data was changed.",
    );
  const metadata = JSON.stringify({
    version: 1,
    exportedAt,
    projects,
    settings: preferences,
  });
  const header = new Blob([metadata.slice(0, -1), ',"conversations":[']);
  const footer = "]}";
  const fixedBytes = header.size + footer.length;
  if (fixedBytes > limit)
    throw new Error(
      "Backup metadata alone exceeds the file limit. No data was changed.",
    );
  const groups: ExportPlan["groups"] = [];
  const tooLarge: string[] = [];
  let parts: BlobPart[] = [header];
  let bytes = fixedBytes;
  let count = 0;
  const finish = () => {
    groups.push({
      blob: new Blob([...parts, footer], { type: "application/json" }),
      count,
    });
    parts = [header];
    bytes = fixedBytes;
    count = 0;
  };
  for (const chat of chats) {
    let record: Blob;
    try {
      record = new Blob([JSON.stringify(portableConversation(chat))]);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      tooLarge.push(chat.title);
      continue;
    }
    if (fixedBytes + record.size > limit) {
      tooLarge.push(chat.title);
      continue;
    }
    if (count && bytes + 1 + record.size > limit) finish();
    if (count) {
      parts.push(",");
      bytes++;
    }
    parts.push(record);
    bytes += record.size;
    count++;
  }
  if (count || !chats.length) finish();
  return { groups, tooLarge, omittedServerAddress };
}

export function downloadBackup(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readBackupFile(file: Blob, limit = backupByteLimit) {
  if (file.size > limit)
    throw new Error("Backup exceeds the 100 MiB file limit.");
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    /* Use the same localized message for invalid JSON and invalid records. */
  }
  if (!validBackup(data))
    throw new Error("Invalid or unsupported backup file.");
  return data;
}
