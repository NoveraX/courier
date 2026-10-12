#!/usr/bin/env node
/// <reference types="node" />
/**
 * Render the READMEs' images from their HTML sources in `.github/assets/src`,
 * each in a light and a dark variant at twice its size, with Playwright's
 * Chromium: `node scripts/render-readme-assets.mjs`, or name the images to
 * render only those: `node scripts/render-readme-assets.mjs react mcp`.
 *
 * The sources load their fonts from Google Fonts, so rendering needs the
 * network; each image is taken once its fonts have loaded. Each is written
 * with an indexed palette by sharp, which the repository has through
 * Next.js, at about a third of the size Chromium writes it at.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const ASSETS = join(ROOT, ".github", "assets");

/** Each image, at the size its page is laid out for. */
const IMAGES = [
  { name: "hero", width: 1200, height: 600 },
  { name: "architecture", width: 1200, height: 640 },
  { name: "react", width: 1200, height: 600 },
  { name: "codelens", width: 1200, height: 600 },
  { name: "mcp", width: 1200, height: 760 },
  { name: "create", width: 1200, height: 820 },
];

const THEMES = ["light", "dark"];

/**
 * The images to render: those named on the command line, else every one.
 *
 * @param {string[]} named - The names given
 * @returns {typeof IMAGES}
 */
function selected(named) {
  if (named.length === 0) return IMAGES;
  const unknown = named.filter((name) => !IMAGES.some((image) => image.name === name));
  if (unknown.length > 0) {
    console.error(`No image named ${unknown.join(", ")}: ${IMAGES.map((i) => i.name).join(", ")}`);
    exit(1);
  }
  return IMAGES.filter((image) => named.includes(image.name));
}

/**
 * A PNG written again with an indexed palette, or as it was when sharp
 * cannot be loaded.
 *
 * @param {Buffer} png - The image
 * @returns {Promise<Buffer>}
 */
async function compressed(png) {
  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    console.warn("sharp could not be loaded; the image stays as Chromium wrote it");
    return png;
  }
  return sharp(png).png({ palette: true, quality: 92, effort: 10 }).toBuffer();
}

const browser = await chromium.launch();
try {
  for (const { name, width, height } of selected(argv.slice(2))) {
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      const source = pathToFileURL(join(ASSETS, "src", `${name}.html`));
      source.searchParams.set("theme", theme);
      await page.goto(source.href, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const output = join(ASSETS, `${name}-${theme}.png`);
      writeFileSync(output, await compressed(await page.screenshot({ type: "png" })));
      await page.close();
      console.log(output.slice(ROOT.length + 1));
    }
  }
} finally {
  await browser.close();
}
