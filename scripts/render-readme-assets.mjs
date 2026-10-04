#!/usr/bin/env node
/// <reference types="node" />
/**
 * Render the README's images from their HTML sources in `.github/assets/src`,
 * each in a light and a dark variant at twice its size, with a headless
 * Chrome: `node scripts/render-readme-assets.mjs`.
 *
 * Chrome is taken from `CHROME_PATH`, else from where macOS installs it, else
 * from `google-chrome` or `chromium` on the PATH. The sources load their
 * fonts from Google Fonts, so rendering needs the network.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { env, exit } from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const ASSETS = join(ROOT, ".github", "assets");

/** Each image, at the size its page is laid out for. */
const IMAGES = [
  { name: "hero", width: 1200, height: 600 },
  { name: "architecture", width: 1200, height: 640 },
];

const THEMES = ["light", "dark"];

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * The Chrome to render with.
 *
 * @returns {string} Its executable
 */
function chrome() {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  if (existsSync(MAC_CHROME)) return MAC_CHROME;
  for (const name of ["google-chrome", "chromium"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      /* Not on the PATH; the next name is tried. */
    }
  }
  console.error("No Chrome found: set CHROME_PATH to its executable.");
  exit(1);
}

const executable = chrome();
for (const { name, width, height } of IMAGES) {
  for (const theme of THEMES) {
    const page = pathToFileURL(join(ASSETS, "src", `${name}.html`));
    page.searchParams.set("theme", theme);
    const output = join(ASSETS, `${name}-${theme}.png`);
    execFileSync(
      executable,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=2",
        `--window-size=${width},${height}`,
        "--virtual-time-budget=8000",
        `--screenshot=${output}`,
        page.href,
      ],
      { stdio: "ignore" },
    );
    console.log(`${output.slice(ROOT.length + 1)}`);
  }
}
