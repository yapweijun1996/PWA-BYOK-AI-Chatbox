import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { renderShellWorker } from "./scripts/shell-worker.mjs";
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
      apply: "build",
      generateBundle: {
        order: "post",
        handler(_, bundle) {
          const html = bundle["index.html"];
          if (html?.type !== "asset") this.error("Missing final index.html");
          const files = new Map<string, string | Uint8Array>([
            ["./", html.source],
          ]);
          for (const name of [
            "manifest.webmanifest",
            "icon.svg",
            "icon-192.png",
            "icon-512.png",
          ]) {
            files.set(`./${name}`, readFileSync(`public/${name}`));
          }
          // WOFF2 is the first KaTeX source. Include the local Worker and WASM,
          // but not alternate encodings of the same fonts.
          for (const name of Object.keys(bundle).sort()) {
            if (!/\.(js|css|woff2|wasm)$/.test(name)) continue;
            const file = bundle[name];
            files.set(
              `./${name}`,
              file.type === "chunk" ? file.code : file.source,
            );
          }
          const worker = renderShellWorker(
            readFileSync("public/sw.js", "utf8"),
            files,
          );
          // Retain the public URL inventory for older clients and tooling.
          this.emitFile({
            type: "asset",
            fileName: "precache-manifest.json",
            source: JSON.stringify([...files.keys()]),
          });
          this.emitFile({ type: "asset", fileName: "sw.js", source: worker });
        },
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
