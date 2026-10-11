import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env, platform } from "node:process";
import { _electron } from "@playwright/test";

export const ROOT = resolve(new URL("../..", import.meta.url).pathname);
export const OUT = join(ROOT, "docs", "public", "images", "vscode");
export const WALKTHROUGH = join(ROOT, "packages", "vscode", "media", "walkthrough");
export const STUDIO = `http://localhost:${env.STUDIO_PORT ?? 6280}`;
const MAC = "/Applications/Visual Studio Code.app/Contents";
const CODE = env.VSCODE_PATH ?? join(MAC, "MacOS", "Code");
const CLI = env.VSCODE_CLI ?? join(MAC, "Resources", "app", "bin", "code");

/** The editor's look for each theme the docs show. */
export const THEMES = [
  { name: "light", theme: "Default Light Modern" },
  { name: "dark", theme: "Default Dark Modern" },
];

/**
 * A VS Code profile of its own in a short folder — VS Code's socket path,
 * inside it, must stay under 104 characters — with the extension installed
 * from its .vsix, so the editor you work in is left alone.
 *
 * @param {string} theme - The colour theme
 * @param {(root: string) => Record<string, unknown>} [settings] - Settings beside the shots' own, by the profile's folder
 * @param {unknown[]} [keys] - Key bindings the shots press
 * @returns {{ root: string, dirs: string[] }} The profile's folder and the arguments that name it
 */
export function profileFor(theme, settings = () => ({}), keys = []) {
  const root = mkdtempSync(join(platform === "win32" ? (env.TEMP ?? ".") : "/tmp", "cv-"));
  mkdirSync(join(root, "user", "User"), { recursive: true });
  const user = {
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
    ...settings(root),
  };
  writeFileSync(join(root, "user", "User", "settings.json"), JSON.stringify(user));
  writeFileSync(join(root, "user", "User", "keybindings.json"), JSON.stringify(keys));
  const dirs = [`--user-data-dir=${join(root, "user")}`, `--extensions-dir=${join(root, "ext")}`];
  execFileSync(CLI, [
    ...dirs,
    "--install-extension",
    join(ROOT, "packages/vscode/dist/courier.vsix"),
  ]);
  return { root, dirs };
}

/**
 * Open VS Code on the demo shop, in a profile, at a size.
 *
 * @param {{ dirs: string[] }} profile - The profile
 * @param {{ width: number, height: number }} size - The window's size
 * @param {string[]} [develop] - Folders of extensions to run beside Courier
 * @returns {Promise<{ app: import("@playwright/test").ElectronApplication, page: import("@playwright/test").Page }>} The editor
 */
export async function openEditor(profile, size, develop = []) {
  const app = await _electron.launch({
    executablePath: CODE,
    args: [
      ...profile.dirs,
      ...develop.map((folder) => `--extensionDevelopmentPath=${folder}`),
      "--disable-workspace-trust",
      "--skip-welcome",
      "--new-window",
      join(ROOT, "examples/demo-shop"),
    ],
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, bounds) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 40, y: 40, ...bounds });
  }, size);
  await page.waitForSelector(".monaco-workbench", { timeout: 60_000 });
  return { app, page };
}

/**
 * The window, or a part of it, as a PNG with an indexed palette, as the README images are.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @param {string} name - The shot's name, the theme's added: `lens-dark.png`
 * @param {{ x: number, y: number, width: number, height: number }} [clip] - The part
 * @returns {Promise<string>} Where it went
 */
export async function shoot(page, name, clip) {
  const { default: sharp } = await import("sharp");
  const png = await page.screenshot({ type: "png", ...(clip && { clip }) });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, await sharp(png).png({ palette: true, quality: 92, effort: 10 }).toBuffer());
  console.log(file.slice(ROOT.length + 1));
  return file;
}
