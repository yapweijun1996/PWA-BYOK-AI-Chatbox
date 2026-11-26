/** Parse bounded CSV without dropping field contents. The first non-empty row is the header. */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;

  function addCell() {
    row.push(cell);
    if (row.length > 100) throw new Error("CSV exceeds the 100 column limit.");
    cell = "";
    closed = false;
  }
  function addRow() {
    addCell();
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
      if (rows.length > 50_001) throw new Error("CSV exceeds the 50,000 data row limit.");
    }
    row = [];
  }
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (quoted) {
      if (character === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += character;
    } else if (character === '"') {
      if (cell || closed) throw new Error("Unexpected quote in CSV field.");
      quoted = true;
    } else if (character === ",") addCell();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[i + 1] === "\n") i++;
      addRow();
    } else {
      if (closed) throw new Error("Unexpected character after quoted CSV field.");
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (row.length || cell || closed) addRow();
  if (!rows.length) throw new Error("CSV is empty.");
  const headers = rows[0].map((value) => value.trim());
  if (headers.some((value) => !value) || new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be nonempty and unique.");
  rows[0] = headers;
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].length !== headers.length)
      throw new Error(`CSV record ${index + 1} has an unexpected number of fields.`);
  }
  return rows;
}
