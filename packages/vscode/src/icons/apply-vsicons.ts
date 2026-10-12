import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

import { copyIcons, removeCopies } from "./icon-copies";
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
  const copied = await copyIcons(copiesFor(iconsDir));
  await changeThemeSettings(
    vsiconsTheme(),
    [
      [VSICONS_FILES, withCourierEntries(userSetting(VSICONS_FILES), VSICONS_PLAN.files)],
      [VSICONS_FOLDERS, withCourierEntries(userSetting(VSICONS_FOLDERS), VSICONS_PLAN.folders)],
    ],
    copied,
  );
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
  await removeCopies(copyPaths());
}

/**
 * Keep Courier's icons in vscode-icons as the user's settings say, on this
 * machine too: while the settings hold Courier's associations — set here,
 * or brought by Settings Sync from another machine — its icons are in the
 * custom icons folder, copied again when they were missing or Courier's
 * changed, and its entries as this Courier writes them, vscode-icons
 * applying them when anything changed; once no settings hold them — the
 * user's, nor a workspace's that a team shares its icons by — the copies
 * go too.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @example
 * ```ts
 * await keepVsiconsCurrent(iconsDir);
 * ```
 */
export async function keepVsiconsCurrent(iconsDir: string): Promise<void> {
  if (hasVsiconsIcons()) {
    const copied = await copyIcons(copiesFor(iconsDir));
    /* Courier's own entries, where the settings hold them, as this Courier writes them: a newer one may add to them. */
    const current = [
      [VSICONS_FILES, VSICONS_PLAN.files],
      [VSICONS_FOLDERS, VSICONS_PLAN.folders],
    ] as const;
    const changes = current
      .filter(([key]) => hasCourierEntries(userSetting(key)))
      .map(([key, ours]): [string, unknown] => [key, withCourierEntries(userSetting(key), ours)]);
    await changeThemeSettings(vsiconsTheme(), changes, copied);
    return;
  }
  const anywhere = vscode.workspace.getConfiguration();
  const used = [VSICONS_FILES, VSICONS_FOLDERS].some((key) => hasCourierEntries(anywhere.get(key)));
  /* vscode-icons rebuilds only when its settings change while it runs: taken out while the editor was closed, it is asked. */
  if (!used && (await removeCopies(copyPaths()))) await vsiconsTheme().apply?.();
}

/**
 * Whether the user's settings hold Courier's associations for vscode-icons.
 *
 * @returns Whether they do
 * @example
 * ```ts
 * if (hasVsiconsIcons()) return;
 * ```
 */
export function hasVsiconsIcons(): boolean {
  return (
    hasCourierEntries(userSetting(VSICONS_FILES)) || hasCourierEntries(userSetting(VSICONS_FOLDERS))
  );
}

/* The copies in vscode-icons' custom icons folder. */
function copyPaths(): string[] {
  const folder = customFolder();
  return [...VSICONS_PLAN.copies.values()].map((name) => join(folder, name));
}

/* Each icon Courier ships, by the path of its copy in vscode-icons' custom icons folder, named as vscode-icons reads it. */
function copiesFor(iconsDir: string): Map<string, string> {
  const folder = customFolder();
  return new Map(
    [...VSICONS_PLAN.copies].map(([ours, theirs]) => [join(folder, theirs), join(iconsDir, ours)]),
  );
}

/* vscode-icons' theme as it rewrites it, and its own command that applies its settings. */
function vsiconsTheme(): RebuiltTheme {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  const folder = vsicons && join(vsicons.extensionPath, "dist", "src");
  return {
    files: folder
      ? [join(folder, "vsicons-icon-theme.json"), join(folder, "vsicons-icon-theme-zed.json")]
      : [],
    async apply() {
      if (!vsicons) return;
      /* Asked before it started, vscode-icons would hear nothing: it is started first, and asked once its own start is done. */
      if (!vsicons.isActive) await vsicons.activate();
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
