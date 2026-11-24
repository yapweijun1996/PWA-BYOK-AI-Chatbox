import type { Root } from "mdast";

// A trailing Markdown block can change type as new lines arrive (tables, lists, fences).
// Keep that block literal until a real boundary exists; never edit the saved source.
export function remarkStreamingTail() {
  return (tree: Root, file: { toString(): string }) => {
    const last = tree.children.at(-1);
    const start = last?.position?.start.offset;
    const end = last?.position?.end.offset;
    if (
      !last ||
      last.type === "definition" ||
      start === undefined ||
      end === undefined
    )
      return;
    const source = file.toString();
    const after = source.slice(end);
    if (
      ["paragraph", "heading", "table", "thematicBreak"].includes(last.type) &&
      /(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)/.test(after)
    )
      return;
    if (
      (last.type === "code" || last.type === "math") &&
      /^[\t ]*[\r\n]/.test(after)
    ) {
      const lines = source.slice(start, end).split(/\r\n|\r|\n/);
      const opener = /^[\t ]*(`{3,}|~{3,}|\${2,})/.exec(lines[0])?.[1];
      const closer = /^[\t ]*(`{3,}|~{3,}|\${2,})[\t ]*$/.exec(
        lines.at(-1) || "",
      )?.[1];
      if (
        lines.length > 1 &&
        opener &&
        closer &&
        opener[0] === closer[0] &&
        closer.length >= opener.length
      )
        return;
    }
    tree.children[tree.children.length - 1] = {
      type: "paragraph",
      data: { hName: "div", hProperties: { className: ["rich-stream-tail"] } },
      children: [{ type: "text", value: source.slice(start).trimEnd() }],
    };
  };
}

export function safeMessageUrl(value: string, attribute: string, base: string) {
  if (!value || /[\x00-\x1f\x7f]/.test(value)) return;
  try {
    const url = new URL(value, base);
    if (url.username || url.password) return;
    if (attribute === "src") {
      if (
        url.protocol === "https:" ||
        (url.protocol === "http:" && url.origin === new URL(base).origin)
      )
        return url.href;
    } else if (
      attribute === "href" &&
      ["http:", "https:", "mailto:"].includes(url.protocol)
    ) {
      return value.startsWith("#") ? value : url.href;
    }
  } catch {
    // Invalid URLs remain non-interactive text.
  }
}
