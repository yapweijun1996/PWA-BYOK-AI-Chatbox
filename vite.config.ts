import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "precache-manifest",
      generateBundle(_, bundle) {
        const files = Object.keys(bundle).filter((name) =>
          /\.(js|css)$/.test(name),
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
        const hash = createHash("sha256").update(manifest);
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
  base: "./",
});
