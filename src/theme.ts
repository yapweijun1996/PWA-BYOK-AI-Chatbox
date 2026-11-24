import type { Settings } from "./types";

export const systemThemeQuery = "(prefers-color-scheme: dark)";

export const resolveTheme = (theme: Settings["theme"], dark: boolean) =>
  theme === "system" ? (dark ? "dark" : "light") : theme;

export function applyTheme(
  theme: Settings["theme"],
  dark = matchMedia(systemThemeQuery).matches,
) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(theme, dark);
  const chrome = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (chrome)
    chrome.content = getComputedStyle(root)
      .getPropertyValue("--startup-bg")
      .trim();
}

// The head script reads only this theme hint. IndexedDB remains authoritative.
export function rememberTheme(theme: Settings["theme"]) {
  try {
    if (theme === "system") localStorage.removeItem("luma:theme");
    else localStorage.setItem("luma:theme", theme);
  } catch {
    // The app can still restore the preference from IndexedDB if Web Storage is disabled.
  }
}
