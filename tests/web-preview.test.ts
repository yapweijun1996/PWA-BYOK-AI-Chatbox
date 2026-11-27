import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichMessage } from "../src/components/RichMessage";
import { previewDocument, previewLanguages } from "../src/web-preview";

describe("web preview", () => {
  it("only offers an opt-in preview for supported fenced blocks", () => {
    const render = (text: string) => renderToStaticMarkup(createElement(RichMessage, { text, locale: "en" }));
    for (const language of ["html", "svg", "css", "javascript", "js"]) {
      expect(previewLanguages.has(language)).toBe(true);
      const html = render(`\`\`\`${language}\nexample\n\`\`\``);
      expect(html).toContain(">Preview</button>");
      expect(html).not.toContain("<iframe");
    }
    expect(render("```python\nprint(1)\n```")).not.toContain(">Preview</button>");
  });
  it("keeps interactive execution behind an explicit mode", () => {
    const html = previewDocument("html", "<p>Example</p>", true);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("<p>Example</p>");
  });
});
