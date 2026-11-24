import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichMessage } from "../src/components/RichMessage";
import { safeMessageUrl } from "../src/rich-markdown";

const render = (text: string, streaming = false) =>
  renderToStaticMarkup(
    createElement(RichMessage, { text, streaming, locale: "en" }),
  );

describe("rich messages", () => {
  it("renders CommonMark, GFM tables and disabled task items with local KaTeX", () => {
    const html = render(
      [
        "# Heading",
        "",
        "> **Quoted** *emphasis*",
        "",
        "1. First",
        "2. Second",
        "",
        "- [x] Checked",
        "- [ ] Open",
        "",
        "| One | Two |",
        "| --- | --- |",
        "| A | ~~B~~ |",
        "",
        "An [example](https://example.com) and $x^2$.",
        "",
        "$$",
        "\\frac{1}{2}",
        "$$",
      ].join("\n"),
    );
    for (const tag of [
      "h1",
      "blockquote",
      "strong",
      "em",
      "ol",
      "table",
      "th",
      "del",
      "math",
    ])
      expect(html).toContain(`<${tag}`);
    expect(html).toMatch(
      /<input[^>]*type="checkbox"[^>]*disabled|<input[^>]*disabled[^>]*type="checkbox"/,
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('class="katex-display"');
  });

  it("leaves provisional Markdown, code, and LaTeX literal until stable", () => {
    const previous = "# Stable heading\n\n";
    const code = previous + "```js\nconst value = 2;";
    const pending = render(code, true);
    expect(pending).toContain("<h1>Stable heading</h1>");
    expect(pending).toContain("rich-stream-tail");
    expect(pending).not.toContain("Copy code");
    expect(render(code + "\n```", true)).not.toContain("Copy code");
    const closed = render(code + "\n```\n", true);
    expect(closed).toContain("JavaScript");
    expect(closed).toContain("hljs-keyword");
    expect(closed).toContain("Copy code");
    const math = previous + "$$\n\\frac{1}{2}";
    expect(render(math, true)).not.toContain('class="katex-display"');
    expect(render(math + "\n$$\n", true)).toContain('class="katex-display"');
    const paragraph = previous + "Inline $x$ or **bold**";
    expect(render(paragraph, true)).not.toContain("<strong>");
    expect(render(paragraph)).toContain("<strong>bold</strong>");
    expect(render(paragraph)).toContain('class="katex"');
  });

  it("blocks user HTML, unsafe URLs, and automatic image loading", () => {
    const html = render(
      [
        "<iframe src=https://example.com></iframe>",
        "",
        "<img src=x onerror=alert(1)>",
        "",
        "[bad](javascript:alert%281%29) ![unsafe](data:image/png;base64,123)",
        "",
        "[![Diagram](https://example.com/diagram.png)](https://example.com/docs)",
        "",
        "$\\href{javascript:alert(1)}{bad}$",
      ].join("\n"),
    );
    expect(html).not.toMatch(/<iframe|<img|onerror|href="javascript:/);
    expect(html).toContain("Load image: Diagram");
    expect(html).toContain("Open image link");
    expect(
      safeMessageUrl("http://remote.example/a", "src", "http://localhost/"),
    ).toBeUndefined();
    expect(safeMessageUrl("/sample.png", "src", "http://localhost/")).toBe(
      "http://localhost/sample.png",
    );
    expect(
      safeMessageUrl(
        "https://user:pass@example.com",
        "href",
        "https://localhost/",
      ),
    ).toBeUndefined();
  });

  it("labels unsupported code without guessing and gracefully handles invalid math", () => {
    const html = render(
      "```unknown\nif (input) { <code> }\n```\n\n$\\notARealMacro$",
    );
    expect(html).toContain("unknown · Code block");
    expect(html).toContain("&lt;code&gt;");
    expect(html).not.toContain("hljs-");
    expect(html).toContain("\\notARealMacro");
  });
});
