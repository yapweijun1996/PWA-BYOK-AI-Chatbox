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
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = "";
      let quoted = false;
      let rowCount = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
          if (ch === '"' && text[i + 1] === '"') {
            cell += '"';
            i++;
          } else if (ch === '"') quoted = false;
          else if (cell.length < 500) cell += ch;
        } else if (ch === '"' && !cell) quoted = true;
        else if (ch === ",") {
          if (row.length < 30) row.push(cell);
          cell = "";
        } else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          if (row.length < 30) row.push(cell);
          if (rows.length < 4) rows.push(row.slice(0, 30));
          rowCount++;
          row = [];
          cell = "";
        } else if (cell.length < 500) cell += ch;
      }
      if (quoted) throw new Error("CSV has an unclosed quoted field.");
      if (row.length || cell) {
        if (row.length < 30) row.push(cell);
        if (rows.length < 4) rows.push(row);
        rowCount++;
      }
      result.rows = rowCount;
      result.preview = rows;
    }
    self.postMessage(result);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "File analysis failed.",
    });
  }
};
export {};
