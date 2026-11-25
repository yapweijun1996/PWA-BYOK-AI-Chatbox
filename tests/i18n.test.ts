import { describe, expect, it } from "vitest";
import {
  interpolate,
  resolveLanguage,
  translate,
  translateNotice,
  zh,
} from "../src/i18n";
import { ms } from "../src/i18n-ms";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeSettings } from "../src/data-contracts";
import { defaultSettings } from "../src/types";
describe("interface language and existing preferences", () => {
  it("covers every existing interface dictionary key in Malay and preserves placeholders", () => {
    expect(Object.keys(zh).filter((key) => !(key in ms))).toEqual([]);
    for (const [key, value] of Object.entries(ms)) {
      expect(value.match(/\{[^{}]+\}/g)?.sort() ?? [], key).toEqual(
        key.match(/\{[^{}]+\}/g)?.sort() ?? [],
      );
    }
    expect(translateNotice("ms", "Provider returned HTTP 503.")).toContain(
      "503",
    );
    expect(
      translateNotice("ms", "report.csv: files must be 5 MB or smaller."),
    ).toContain("report.csv");
  });
  it("covers literal interface translation calls in Malay", () => {
    const missing = new Set<string>();
    const scan = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          scan(path);
          continue;
        }
        if (!/\.tsx?$/.test(path)) continue;
        const source = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        const visit = (node: ts.Node) => {
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const name = node.expression.text;
            const argument = node.arguments[name === "t" ? 0 : 1];
            if (
              ["t", "translate", "translateNotice"].includes(name) &&
              argument &&
              ts.isStringLiteral(argument) &&
              !(argument.text.trim() in ms)
            )
              missing.add(argument.text.trim());
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    };
    scan("src");
    expect([...missing]).toEqual([]);
  });
  it("uses the browser language for system mode and honors explicit choice", () => {
    expect(resolveLanguage("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLanguage("system", "fr-FR")).toBe("en");
    expect(resolveLanguage("system", "ms-MY")).toBe("ms");
    expect(mergeSettings({ language: "ms" }).language).toBe("ms");
    expect(resolveLanguage("en", "zh-CN")).toBe("en");
  });
  it("restores old settings with a safe language and sidebar default", () => {
    const settings = mergeSettings({
      theme: "dark",
      providers: defaultSettings.providers,
      vaults: {},
    });
    expect(settings.theme).toBe("dark");
    expect(settings.language).toBe("system");
    expect(settings.sidebarCollapsed).toBe(false);
  });
  it("localizes UI and dynamic diagnostics without changing user data", () => {
    expect(translate("zh-CN", "New chat")).toBe("新对话");
    expect(translate("en", "New chat")).toBe("New chat");
    expect(translate("ms", "New chat")).toBe("Sembang baharu");
    expect(translate("ms", "Not translated yet")).toBe("Not translated yet");
    expect(
      interpolate(translate("zh-CN", "Delete {name}"), "Customer notes"),
    ).toContain("Customer notes");
    expect(
      translateNotice(
        "zh-CN",
        "Model list loaded (42). This does not verify your key or chat access. Select one or enter its ID.",
      ),
    ).toContain("42");
    expect(
      translateNotice(
        "zh-CN",
        "Authentication failed (HTTP 401). Check this provider's key or token.",
      ),
    ).toContain("401");
    expect(translate("zh-CN", "IndexedDB available")).toBe("IndexedDB 可用");
    expect(
      translateNotice("zh-CN", "Invalid time zone specified: Example/Invalid"),
    ).toBe("无效的时区：Example/Invalid");
  });
});
