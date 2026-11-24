export async function applyServerAddress(page, address) {
  await page.getByRole("button", { name: "Edit server address" }).click();
  const editor = page.getByRole("dialog", { name: "Edit server address" });
  await editor.getByLabel("Server base URL").fill(address);
  await editor.getByRole("button", { name: "Apply address" }).click();
  await editor.waitFor({ state: "hidden" });
}
