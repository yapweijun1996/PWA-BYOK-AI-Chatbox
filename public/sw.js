// Vite fills these with the final build identity and [relative URL, SRI] pairs.
const REVISION = "__LUMA_REVISION__";
const APP_VERSION = "__LUMA_APP_VERSION__";
const PRECACHE = /* __LUMA_PRECACHE__ */ [];
const scope = self.registration.scope;
// Unlike the old luma-shell-* namespace, this cannot be swept by a legacy worker.
const prefix = `luma-shell:${encodeURIComponent(scope)}:`;
const cacheName = prefix + REVISION;
const shell = new URL("./", scope).href;
const index = new URL("index.html", scope).href;
const assets = new Map(
  PRECACHE.map(([path, digest]) => [new URL(path, scope).href, digest]),
);
const pinnedRequest = (url) =>
  new Request(url, {
    mode: "same-origin",
    redirect: "error",
    cache: "reload",
    integrity: assets.get(url),
  });

self.addEventListener("message", (event) => {
  if (event.data?.type === "LUMA_GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION });
    event.ports[0].close();
  }
});

async function installShell() {
  if (!assets.has(shell)) throw new Error("Missing built shell manifest");
  const existed = await caches.has(cacheName);
  const cache = await caches.open(cacheName);
  try {
    // A single atomic batch. Even a 200 response from the wrong deploy fails SRI.
    await cache.addAll(Array.from(assets.keys(), pinnedRequest));
  } catch (error) {
    if (!existed) await caches.delete(cacheName);
    throw error;
  }
}
self.addEventListener("install", (event) => event.waitUntil(installShell()));

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Activation waits naturally for the old clients. Legacy caches have no
      // trustworthy owner, so never delete them (or a sibling registration's cache).
      const old = (await caches.keys()).filter(
        (name) =>
          name !== cacheName &&
          name.startsWith(prefix) &&
          /^[a-f0-9]{64}$/.test(name.slice(prefix.length)),
      );
      await Promise.all(old.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  ),
);

async function fromInstalledBuild(url) {
  const cached = await caches.match(url, { cacheName, ignoreVary: true });
  // If the entry was evicted, only these exact bytes can substitute for it.
  return cached || fetch(pinnedRequest(url));
}
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (
    request.method !== "GET" ||
    request.headers.has("Authorization") ||
    request.headers.has("Range")
  )
    return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    url.search = "";
    url.hash = "";
    if (url.href === shell || url.href === index)
      event.respondWith(fromInstalledBuild(shell));
  } else if (assets.has(url.href) && url.href !== shell) {
    event.respondWith(fromInstalledBuild(url.href));
  }
});
