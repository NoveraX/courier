#!/usr/bin/env node
/// <reference types="node" />
/**
 * Photograph Studio for the READMEs, each shot in a light and a dark variant
 * at twice its size: the demo shop's Timeline (`studio-timeline-*.png`) and
 * one of its calls open in the inspector (`studio-inspector-*.png`). Start
 * the demo first (`npm run demo` in examples/demo-shop), then run
 * `node scripts/render-studio-shot.mjs`, naming the port Studio listens on
 * when it is not 6280: `node scripts/render-studio-shot.mjs 6297`.
 *
 * Studio's token is read from the demo's `.courier/studio-token` and never
 * printed. The shots are taken the way a person would set Studio up for
 * them: the theme picked with the header's theme button, and notifications
 * for failed and slow calls turned off in the settings the page brings, so
 * none covers the Timeline. The demo keeps both in its project until its
 * next reset. The version badge is left out: in the repository every package
 * reads 0.0.0 until its release sets the version.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const ASSETS = join(ROOT, ".github", "assets");
const TOKEN_FILE = join(ROOT, "examples", "demo-shop", ".courier", "studio-token");

/** The call the inspector shows: it passes through three middleware steps. */
const ENDPOINT = "payments.charges.create";
const ATTEMPTS = 6;
const THEMES = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];
const SETTINGS_KEY = "courier-studio-v2-settings";
/** An empty stretch of the sidebar, where the pointer rests for each shot. */
const REST = { x: 120, y: 700 };

/**
 * Studio's token, or exit with how to get one.
 *
 * @returns {string}
 */
function studioToken() {
  try {
    return readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    console.error(
      "Studio's token was not found: start the demo with `npm run demo` in examples/demo-shop",
    );
    exit(1);
  }
}

/**
 * Click the header's theme button until it names the theme.
 *
 * @param {import("@playwright/test").Page} page - Studio
 * @param {string} label - The theme's name as the button shows it
 */
async function chooseTheme(page, label) {
  const button = page.getByRole("button", { name: /^Theme: / });
  for (let step = 0; step < 3; step++) {
    if ((await button.getAttribute("aria-label"))?.startsWith(`Theme: ${label}.`)) return;
    await button.click();
  }
  throw new Error(`Studio's theme could not be set to ${label}`);
}

/**
 * The page as it is, once the version badge is gone and the pointer rests.
 *
 * @param {import("@playwright/test").Page} page - Studio
 * @returns {Promise<Buffer>}
 */
async function capture(page) {
  await page.evaluate(() => {
    for (const badge of document.querySelectorAll('aside[aria-label="Studio"] span')) {
      if (/^\d+\.\d+\.\d+$/.test(badge.textContent?.trim() ?? "")) badge.remove();
    }
  });
  await page.mouse.move(REST.x, REST.y);
  await page.waitForTimeout(600);
  const { default: sharp } = await import("sharp");
  return sharp(await page.screenshot({ type: "png" }))
    .png({ palette: true, quality: 92, effort: 10 })
    .toBuffer();
}

/**
 * Open the `index`th call to the endpoint and tell whether it succeeded.
 *
 * @param {import("@playwright/test").Page} page - Studio's Timeline
 * @param {number} index - Which of the endpoint's calls to open
 * @returns {Promise<boolean>}
 */
async function openCall(page, index) {
  await page.getByText(ENDPOINT, { exact: true }).nth(index).click();
  const inspector = page.getByRole("complementary").filter({ hasText: "Checks" });
  await inspector.waitFor({ timeout: 10_000 });
  return (await inspector.getByText("Success", { exact: true }).count()) > 0;
}

/**
 * A successful call open in the inspector, its row in the middle of the
 * Timeline. Recording pauses while the call is picked, so the rows hold
 * still, and resumes from the pill that counts the calls held meanwhile,
 * which the inspector leaves uncovered. The inspector is closed again after.
 *
 * @param {import("@playwright/test").Page} page - Studio's Timeline
 * @returns {Promise<Buffer>}
 */
async function inspector(page) {
  await page.getByRole("button", { name: "Pause recording" }).click();
  for (let index = 0; index < ATTEMPTS; index++) {
    if (!(await openCall(page, index))) continue;
    const resume = page.getByRole("button", { name: /new · resume$/ });
    await resume.click({ timeout: 10_000 });
    await resume.waitFor({ state: "detached" });
    await page
      .locator('button[data-request-id][aria-pressed="true"]')
      .evaluate((row) => row.scrollIntoView({ block: "center" }));
    const image = await capture(page);
    await page.getByRole("button", { name: "Close the inspector" }).click();
    return image;
  }
  throw new Error(`None of ${ATTEMPTS} ${ENDPOINT} calls succeeded`);
}

const SHOTS = [
  { name: "timeline", take: capture },
  { name: "inspector", take: inspector },
];

const port = Number(argv[2] ?? 6280);
const token = studioToken();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(
    ([key, settings]) => localStorage.setItem(key, JSON.stringify(settings)),
    [SETTINGS_KEY, { toastOnError: false, toastOnSlowRequest: false }],
  );
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/timeline#token=${token}`);
  await page.getByText(ENDPOINT, { exact: true }).first().waitFor({ timeout: 30_000 });
  for (const { theme, label } of THEMES) {
    await chooseTheme(page, label);
    for (const { name, take } of SHOTS) {
      const output = join(ASSETS, `studio-${name}-${theme}.png`);
      writeFileSync(output, await take(page));
      console.log(output.slice(ROOT.length + 1));
    }
  }
} catch (error) {
  console.error(
    String(error instanceof Error ? error.message : error).replaceAll(token, "<token>"),
  );
  exit(1);
} finally {
  await browser.close();
}
