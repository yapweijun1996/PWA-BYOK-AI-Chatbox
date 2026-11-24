import assert from "node:assert/strict";

export async function shellCaches(page, scope) {
  return page.evaluate(async (owner) => {
    const prefix = `luma-shell:${encodeURIComponent(owner ?? (await navigator.serviceWorker.ready).scope)}:`;
    return (await caches.keys()).filter((key) => key.startsWith(prefix));
  }, scope);
}

export async function onlyShellCache(page, scope) {
  const names = await shellCaches(page, scope);
  assert.equal(
    names.length,
    1,
    "Expected one installed build in this registration",
  );
  return names[0];
}
