import { createHash } from "node:crypto";

// `files` contains the final served bytes, including Vite's transformed HTML.
// Keep the worker independent of the mutable manifest URL during installation.
export function renderShellWorker(template, files) {
  if (!files.has("./")) throw new Error("Missing production HTML shell");
  const versionSlot = '"__LUMA_REVISION__"';
  const manifestSlot = "/* __LUMA_PRECACHE__ */ []";
  if (!template.includes(versionSlot) || !template.includes(manifestSlot)) {
    throw new Error("Missing shell worker build placeholders");
  }
  const entries = JSON.stringify(
    [...files].map(([path, bytes]) => [
      path,
      `sha256-${createHash("sha256").update(bytes).digest("base64")}`,
    ]),
  );
  const revision = createHash("sha256")
    .update(template)
    .update(entries)
    .digest("hex");
  return template
    .replace(versionSlot, () => JSON.stringify(revision))
    .replace(manifestSlot, () => entries);
}
