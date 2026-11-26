import { parseCsv } from "./csv-parser";

type FileTask = {
  name: string;
  text: string;
  operation: string;
  offset: number;
};

self.onmessage = ({ data }: MessageEvent<FileTask>) => {
  try {
    const { name, text, operation, offset } = data;
    if (operation === "read") {
      self.postMessage({
        name,
        offset,
        totalCharacters: text.length,
        text: text.slice(offset, offset + 1800),
        nextOffset: offset + 1800 < text.length ? offset + 1800 : null,
      });
      return;
    }
    const result: Record<string, unknown> = {
      name,
      characters: text.length,
      lines: text ? text.split(/\r\n|\r|\n/).length : 0,
    };
    if (/\.json$/i.test(name)) {
      const value: unknown = JSON.parse(text);
      result.type = Array.isArray(value)
        ? "array"
        : value === null
          ? "null"
          : typeof value;
      if (Array.isArray(value)) {
        result.items = value.length;
        result.preview = value.slice(0, 3);
      } else if (value && typeof value === "object") {
        result.keys = Object.keys(value).slice(0, 30);
      }
    } else if (/\.csv$/i.test(name)) {
      const rows = parseCsv(text);
      result.rows = rows.length;
      result.preview = rows.slice(0, 4).map((row) => row.slice(0, 30).map((cell) => cell.slice(0, 500)));
      result.previewTruncated = rows.length > 4 || rows.some((row) => row.length > 30 || row.some((cell) => cell.length > 500));
    }
    self.postMessage(result);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "File analysis failed.",
    });
  }
};
export {};
