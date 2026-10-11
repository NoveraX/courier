#!/usr/bin/env node
/// <reference types="node" />
/**
 * Photograph the Courier extension at work in VS Code, for its docs page and
 * its README: the figures above the calls in the demo shop's
 * `src/traffic/visit.ts`, and the hover over one, each in a light and a dark
 * theme at twice its size, into `docs/public/images/vscode/`.
 *
 * It needs VS Code — `VSCODE_PATH` and `VSCODE_CLI` name its program and its
 * command line, macOS's places by default — the extension packaged, with
 * `npm run package -w courier-vscode`, and Studio running for the demo shop
 * as a project's own Studio, its traffic flowing. `npm run demo` serves a
 * public demo, which writes no address file for an editor to find, so start
 * the parts in examples/demo-shop instead: `npm run upstream`,
 * `npx @noverax/courier-studio`, `npm run app` and `npm run traffic`, each
 * on the ports its environment names (see src/ports.ts).
 *
 * VS Code runs in a profile of its own, the extension installed there from
 * its .vsix, so the editor you work in is left alone.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env, platform } from "node:process";
import { _electron } from "@playwright/test";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const OUT = join(ROOT, "docs", "public", "images", "vscode");
const MAC = "/Applications/Visual Studio Code.app/Contents";
const CODE = env.VSCODE_PATH ?? join(MAC, "MacOS", "Code");
const CLI = env.VSCODE_CLI ?? join(MAC, "Resources", "app", "bin", "code");
const SIZE = { width: 940, height: 620 };
const THEMES = [
  { name: "light", theme: "Default Light Modern" },
  { name: "dark", theme: "Default Dark Modern" },
];

/* A profile in a short folder: VS Code's socket path, inside it, must stay under 104 characters. */
function profileFor(theme) {
  const root = mkdtempSync(join(platform === "win32" ? (env.TEMP ?? ".") : "/tmp", "cv-"));
  mkdirSync(join(root, "user", "User"), { recursive: true });
  writeFileSync(
    join(root, "user", "User", "settings.json"),
    JSON.stringify({
      "workbench.colorTheme": theme,
      "workbench.startupEditor": "none",
      "workbench.secondarySideBar.defaultVisibility": "hidden",
      "chat.disableAIFeatures": true,
      "editor.minimap.enabled": false,
      "editor.fontSize": 15,
      "editor.lineHeight": 24,
      "editor.stickyScroll.enabled": false,
      "update.mode": "none",
      "extensions.autoUpdate": false,
      "security.workspace.trust.enabled": false,
      "telemetry.telemetryLevel": "off",
      "extensions.ignoreRecommendations": true,
      /* The demo shop sits inside this repository; VS Code would offer to open it in a notification. */
      "git.openRepositoryInParentFolders": "never",
    }),
  );
  const dirs = [`--user-data-dir=${join(root, "user")}`, `--extensions-dir=${join(root, "ext")}`];
  execFileSync(CLI, [
    ...dirs,
    "--install-extension",
    join(ROOT, "packages/vscode/dist/courier.vsix"),
  ]);
  return { root, dirs };
}

/**
 * Open the shopper's visit at its checkout, with the figures above its calls.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 */
async function openVisit(page) {
  await page.waitForSelector(".monaco-workbench", { timeout: 60_000 });
  await page.keyboard.press(platform === "darwin" ? "Meta+P" : "Control+P");
  await page.keyboard.type("visit.ts", { delay: 30 });
  await page.waitForTimeout(900);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".codelens-decoration", { timeout: 60_000 });
  await page.keyboard.press(platform === "darwin" ? "Meta+B" : "Control+B");
  await page.keyboard.press("Control+G");
  await page.keyboard.type("45", { delay: 30 });
  await page.keyboard.press("Enter");
  /* The figures come from Studio every few seconds; let them settle. */
  await page.waitForTimeout(6000);
}

/**
 * The window as a PNG with an indexed palette, as the README images are.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @param {string} file - Where it goes
 */
async function shoot(page, file) {
  const { default: sharp } = await import("sharp");
  const png = await page.screenshot({ type: "png" });
  writeFileSync(file, await sharp(png).png({ palette: true, quality: 92, effort: 10 }).toBuffer());
  console.log(file.slice(ROOT.length + 1));
}

mkdirSync(OUT, { recursive: true });
for (const { name, theme } of THEMES) {
  const { root, dirs } = profileFor(theme);
  const app = await _electron.launch({
    executablePath: CODE,
    args: [
      ...dirs,
      "--disable-workspace-trust",
      "--skip-welcome",
      "--new-window",
      join(ROOT, "examples/demo-shop"),
    ],
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ x: 40, y: 40, ...size });
    }, SIZE);
    await openVisit(page);
    await page.mouse.move(SIZE.width / 2, 12);
    await shoot(page, join(OUT, `lens-${name}.png`));
    const place = page
      .locator(".view-line", { hasText: "storefront.orders.place" })
      .locator("span span", { hasText: /^place$/ });
    await place.first().hover();
    await page.waitForSelector(".monaco-hover:not(.hidden)", { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await shoot(page, join(OUT, `hover-${name}.png`));
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
}
