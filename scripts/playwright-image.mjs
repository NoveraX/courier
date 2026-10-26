#!/usr/bin/env node
/// <reference types="node" />
/**
 * Name the image Playwright publishes for the release the lockfile pins.
 *
 * The CI jobs that drive a browser run in it: Chromium, WebKit and Firefox
 * come installed there with every library, font and display server they
 * load, so no run waits on the system's package mirror to install them.
 * The name follows the lockfile, so updating Playwright moves the jobs to
 * the image of the new release with it.
 *
 *   node scripts/playwright-image.mjs   mcr.microsoft.com/playwright:v1.64.0-noble
 *
 * Exits 1 when the lockfile pins no release an image is named after.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const LOCKFILE = "package-lock.json";
/* The browsers belong to playwright-core: @playwright/test and playwright pass it on. */
const CORE = "node_modules/playwright-core";
/* Ubuntu 24.04, the release the CI runners run. */
const UBUNTU = "noble";
/* The version becomes part of the image's name, so nothing but a version may. */
const RELEASE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * The image Playwright publishes for the release a lockfile pins.
 *
 * @param {unknown} lockfile - The parsed `package-lock.json`
 * @returns {string} The image's name with its tag
 * @throws {Error} When the lockfile pins no release of playwright-core
 * @example
 * ```js
 * playwrightImage({ packages: { "node_modules/playwright-core": { version: "1.64.0" } } });
 * // → "mcr.microsoft.com/playwright:v1.64.0-noble"
 * ```
 */
export function playwrightImage(lockfile) {
  const version = lockfile?.packages?.[CORE]?.version;
  if (typeof version !== "string" || !RELEASE.test(version)) {
    throw new Error(
      `${LOCKFILE} pins no release of playwright-core an image is named after: ${JSON.stringify(version)}`,
    );
  }
  return `mcr.microsoft.com/playwright:v${version}-${UBUNTU}`;
}

function main() {
  console.log(playwrightImage(JSON.parse(readFileSync(join(ROOT, LOCKFILE), "utf8"))));
}

const invokedAsScript = argv[1]?.endsWith("playwright-image.mjs");
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`playwright-image: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}
