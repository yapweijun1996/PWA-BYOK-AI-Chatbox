import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Parse once to exclude code, links, existing math and raw HTML from normalization.
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
type Node = { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Node[] };
const protectedTypes = new Set(["code", "inlineCode", "math", "inlineMath", "link", "linkReference", "definition", "image", "imageReference", "html"]);

/** Convert supported LaTeX delimiters only for presentation; the saved source is unchanged. */
export function normalizeLatexDelimiters(source: string): string {
  if (!source.includes("\\(") && !source.includes("\\[")) return source;
  const protectedRanges: Array<{ start: number; end: number }> = [];
  const visit = (node: Node) => {
    if (protectedTypes.has(node.type)) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) protectedRanges.push({ start, end });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(source) as Node);
  protectedRanges.sort((a, b) => a.start - b.start);
  const escaped = (index: number) => {
    let count = 0;
    while (index > 0 && source[--index] === "\\") count++;
    return count % 2 === 1;
  };
  let result = "";
  let cursor = 0;
  let scan = 0;
  let rangeIndex = 0;
  while (scan < source.length - 1) {
    while (rangeIndex < protectedRanges.length && protectedRanges[rangeIndex].end <= scan) rangeIndex++;
    const range = protectedRanges[rangeIndex];
    if (range && range.start <= scan) { scan = range.end; continue; }
    const next = source[scan + 1];
    if (source[scan] !== "\\" || (next !== "(" && next !== "[") || escaped(scan)) { scan++; continue; }
    const closing = next === "(" ? ")" : "]";
    let end = scan + 2;
    while (end < source.length - 1) {
      if (range && end >= range.start) break;
      if (source[end] === "\\" && source[end + 1] === closing && !escaped(end)) break;
      end++;
    }
    if (end >= source.length - 1 || (range && end >= range.start) || source[end] !== "\\" || source[end + 1] !== closing) { scan += 2; continue; }
    const body = source.slice(scan + 2, end);
    if (!body.trim() || body.includes("$") || (next === "(" && /[\r\n]/.test(body))) { scan = end + 2; continue; }
    let standalone = false;
    if (next === "[") {
      const lineStart = source.lastIndexOf("\n", scan - 1) + 1;
      const lineEnd = source.indexOf("\n", end + 2);
      const before = source.slice(lineStart, scan);
      const after = source.slice(end + 2, lineEnd < 0 ? source.length : lineEnd);
      standalone = /^[ \t]*$/.test(before) && /^[ \t\r]*$/.test(after);
    }
    if (next === "[" && !standalone && /[\r\n]/.test(body)) { scan = end + 2; continue; }
    result += source.slice(cursor, scan) + (standalone ? `$$\n${body.trim()}\n$$` : `$${body.trim()}$`);
    cursor = end + 2;
    scan = cursor;
  }
  return cursor ? result + source.slice(cursor) : source;
}
