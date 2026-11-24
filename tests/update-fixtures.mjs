import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderShellWorker } from "../scripts/shell-worker.mjs";

// A is the actual production output. B is a deployment fixture with distinct
// HTML, JS and CSS, built with the same worker generator. No dist files change.
export async function updateFixtures() {
  const dist = resolve("dist");
  const read = (name) => readFile(resolve(dist, name));
  const paths = JSON.parse(await read("precache-manifest.json"));
  const a = new Map(
    await Promise.all(
      paths.map(async (path) => [
        path,
        await read(path === "./" ? "index.html" : path),
      ]),
    ),
  );
  const b = new Map(a);
  const css = "./assets/update-fixture-b.css";
  const js = "./assets/update-fixture-b.js";
  b.set(css, ":root { --update-fixture: B; }");
  b.set(js, 'document.documentElement.dataset.fixtureJs = "B";');
  b.set(
    "./",
    a
      .get("./")
      .toString("utf8")
      .replace(
        "</head>",
        [
          '<meta name="update-fixture" content="B">',
          `<link rel="stylesheet" href="${css}">`,
          `<script type="module" src="${js}"></script>`,
          "</head>",
        ].join("\n"),
      ),
  );
  const template = await readFile("public/sw.js", "utf8");
  const bWorker = renderShellWorker(template, b);
  function release(files, worker) {
    return new Map([
      ...files,
      ["./index.html", files.get("./")],
      ["./sw.js", worker],
      ["./precache-manifest.json", JSON.stringify([...files.keys()])],
    ]);
  }
  return { A: release(a, await read("sw.js")), B: release(b, bWorker), css };
}
