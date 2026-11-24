import { existsSync } from "node:fs";
export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const path = candidates.find((item) => item && existsSync(item));
  if (!path)
    throw new Error(
      "Chrome or Chromium was not found. Set CHROME_PATH to its executable.",
    );
  return path;
}
