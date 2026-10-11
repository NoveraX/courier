import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

import { ICON_THEMES } from "./icon-files";
import { changeThemeSettings, type RebuiltTheme } from "./theme-rewrites";
import { userSetting } from "./user-settings";
import {
  hasCourierEntries,
  VSICONS_APPLY,
  VSICONS_FILES,
  VSICONS_FOLDER_PATH,
  VSICONS_FOLDERS,
  VSICONS_PLAN,
  vsiconsFolder,
  withCourierEntries,
  withoutCourierEntries,
} from "./vscode-icons";

/**
 * Put Courier's icons into vscode-icons: copied into its custom icons
 * folder, then its associations for them after the user's own.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @example
 * ```ts
 * await applyVsicons(iconsDir);
 * ```
 */
export async function applyVsicons(iconsDir: string): Promise<void> {
  await copyIcons(iconsDir);
  await changeThemeSettings(vsiconsTheme(), [
    [VSICONS_FILES, withCourierEntries(userSetting(VSICONS_FILES), VSICONS_PLAN.files)],
    [VSICONS_FOLDERS, withCourierEntries(userSetting(VSICONS_FOLDERS), VSICONS_PLAN.folders)],
  ]);
}

/**
 * Take Courier's icons out of vscode-icons: its associations, the user's
 * own kept, and its icons from the custom icons folder.
 *
 * @example
 * ```ts
 * await removeVsicons();
 * ```
 */
export async function removeVsicons(): Promise<void> {
  await changeThemeSettings(vsiconsTheme(), [
    [VSICONS_FILES, withoutCourierEntries(userSetting(VSICONS_FILES))],
    [VSICONS_FOLDERS, withoutCourierEntries(userSetting(VSICONS_FOLDERS))],
  ]);
  const folder = customFolder();
  await Promise.all(
    [...VSICONS_PLAN.copies.values()].map((name) => rm(join(folder, name), { force: true })),
  );
}

/**
 * Copy Courier's icons into vscode-icons again when Courier's own changed
 * — while its associations are still in the user's settings.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @example
 * ```ts
 * await keepVsiconsCurrent(iconsDir);
 * ```
 */
export async function keepVsiconsCurrent(iconsDir: string): Promise<void> {
  if (!hasCourierEntries(userSetting(VSICONS_FILES)) || (await copiesCurrent(iconsDir))) return;
  await copyIcons(iconsDir);
  await vsiconsTheme().apply?.();
}

/* vscode-icons' theme as it rewrites it, and its own command that applies its settings while it runs. */
function vsiconsTheme(): RebuiltTheme {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  const folder = vsicons && join(vsicons.extensionPath, "dist", "src");
  return {
    files: folder
      ? [join(folder, "vsicons-icon-theme.json"), join(folder, "vsicons-icon-theme-zed.json")]
      : [],
    async apply() {
      if ((await vscode.commands.getCommands(true)).includes(VSICONS_APPLY)) {
        await vscode.commands.executeCommand(VSICONS_APPLY);
      }
    },
  };
}

function customFolder(): string {
  return vsiconsFolder({
    setting: vscode.workspace.getConfiguration().get<string>(VSICONS_FOLDER_PATH, ""),
    workspaces: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    appName: vscode.env.appName,
    platform: process.platform,
    env: process.env,
    home: homedir(),
  });
}

async function copyIcons(iconsDir: string): Promise<void> {
  const folder = customFolder();
  await mkdir(folder, { recursive: true });
  for (const [ours, theirs] of VSICONS_PLAN.copies) {
    await copyFile(join(iconsDir, ours), join(folder, theirs));
  }
}

async function copiesCurrent(iconsDir: string): Promise<boolean> {
  const folder = customFolder();
  for (const [ours, theirs] of VSICONS_PLAN.copies) {
    const [mine, copy] = await Promise.all([
      readFile(join(iconsDir, ours)),
      readFile(join(folder, theirs)).catch(() => undefined),
    ]);
    if (!copy?.equals(mine)) return false;
  }
  return true;
}
