import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

// `files` contains the final served bytes, including Vite's transformed HTML.
// Keep the worker independent of the mutable manifest URL during installation.
export function renderShellWorker(
  template,
  files,
  appVersion = packageVersion,
) {
  if (!files.has("./")) throw new Error("Missing production HTML shell");
  const versionSlot = '"__LUMA_REVISION__"';
  const manifestSlot = "/* __LUMA_PRECACHE__ */ []";
  const appVersionSlot = '"__LUMA_APP_VERSION__"';
  if (
    !template.includes(versionSlot) ||
    !template.includes(manifestSlot) ||
    !template.includes(appVersionSlot)
  ) {
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
    .update(appVersion)
    .digest("hex");
  return template
    .replace(versionSlot, () => JSON.stringify(revision))
    .replace(appVersionSlot, () => JSON.stringify(appVersion))
    .replace(manifestSlot, () => entries);
}
