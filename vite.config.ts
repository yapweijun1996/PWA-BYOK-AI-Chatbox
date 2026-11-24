import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "startup-mark",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html.replace("<!-- startup-icon -->", () =>
            readFileSync("public/icon.svg", "utf8").trim(),
          );
        },
      },
    },
    {
      name: "startup-nonblocking-styles",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          // Paint the inline shell while the gate waits for the app stylesheet.
          return html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) =>
            tag.replace(/>$/, ' media="print" data-startup-style>'),
          );
        },
      },
    },
    {
      name: "precache-manifest",
      generateBundle(_, bundle) {
        // Modern browsers use the first KaTeX font source (WOFF2). Avoid caching
        // three copies of each font during the service worker install.
        const files = Object.keys(bundle).filter((name) =>
          /\.(js|css|woff2|wasm)$/.test(name),
        );
        const publicFiles = [
          "manifest.webmanifest",
          "icon.svg",
          "icon-192.png",
          "icon-512.png",
        ];
        const manifest = JSON.stringify([
          "./",
          ...publicFiles.map((file) => "./" + file),
          ...files.map((file) => "./" + file),
        ]);
        const hash = createHash("sha256")
          .update(manifest)
          .update(readFileSync("index.html"));
        // Public assets keep the same filenames when their contents change.
        for (const file of publicFiles) {
          const content = readFileSync(`public/${file}`);
          hash.update(createHash("sha256").update(content).digest());
        }
        const revision = hash.digest("hex").slice(0, 12);
        const worker = readFileSync("public/sw.js", "utf8").replace(
          "luma-shell-v1",
          `luma-shell-${revision}`,
        );
        this.emitFile({
          type: "asset",
          fileName: "precache-manifest.json",
          source: manifest,
        });
        this.emitFile({ type: "asset", fileName: "sw.js", source: worker });
      },
    },
  ],
  worker: { format: "es" },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return "react-runtime";
          if (id.includes("/node_modules/katex/")) return "katex";
          if (/\/node_modules\/(highlight\.js|lowlight)\//.test(id))
            return "syntax";
        },
      },
    },
  },
  base: "./",
});
