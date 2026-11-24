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
        const manifest = JSON.stringify([
          "./",
          "./manifest.webmanifest",
          "./icon.svg",
          "./icon-192.png",
          "./icon-512.png",
          ...files.map((f) => "./" + f),
        ]);
        const revision = createHash("sha256")
          .update(manifest)
          .digest("hex")
          .slice(0, 12);
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
