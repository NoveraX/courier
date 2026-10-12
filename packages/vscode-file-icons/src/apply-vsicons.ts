import { dirname, join } from "node:path";
import * as vscode from "vscode";

import { builtWithCourier } from "./built-theme";
import { copyIcons, removeCopies } from "./icon-copies";
import { type CourierIcons, ICON_THEMES } from "./icon-files";
import { type IconUsers, iconUsers } from "./icon-users";
import { notHere } from "./theme-reach";
import { changeThemeSettings, type RebuiltTheme } from "./theme-rewrites";
import { settingIn, userSetting } from "./user-settings";
import {
  hasCourierEntries,
  VSICONS_FILES,
  VSICONS_FOLDERS,
  VSICONS_PLAN,
  withCourierEntries,
  withoutCourierEntries,
} from "./vscode-icons";
import { customFolder, vsiconsTheme } from "./vsicons-theme";

/* What names Courier's icons in vscode-icons' built theme: its copy of the config's icon. */
const BUILT_MARK = VSICONS_PLAN.copies.get("courier-config.svg") ?? "file_type_courier-config.svg";

/**
 * Put Courier's icons into vscode-icons: copied into its custom icons
 * folder, this profile counted among those that use them, then its
 * associations for them after the user's own — when vscode-icons runs
 * here, beside this extension, and reads the folder written to.
 *
 * @param icons - Courier's icons, and the profile that puts them in
 * @returns Why vscode-icons cannot take them, or `undefined` once they are in
 * @example
 * ```ts
 * await applyVsicons(icons);
 * ```
 */
export async function applyVsicons(icons: CourierIcons): Promise<string | undefined> {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  if (!vsicons) return notHere("vsicons");
  const copied = await copyIcons(copiesFor(icons.dir));
  await usersOf(vsicons.extensionPath, icons).add();
  await changeThemeSettings(
    vsiconsTheme(vsicons),
    [
      [VSICONS_FILES, withCourierEntries(userSetting(VSICONS_FILES), VSICONS_PLAN.files)],
      [VSICONS_FOLDERS, withCourierEntries(userSetting(VSICONS_FOLDERS), VSICONS_PLAN.folders)],
    ],
    copied,
  );
  return undefined;
}

/**
 * Take Courier's icons out of vscode-icons: its associations, the user's
 * own kept, and its icons from the custom icons folder — unless another
 * profile on this computer still uses them.
 *
 * @param icons - Courier's icons, and the profile that takes them out
 * @example
 * ```ts
 * await removeVsicons(icons);
 * ```
 */
export async function removeVsicons(icons: CourierIcons): Promise<void> {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  await changeThemeSettings(vsiconsTheme(vsicons), [
    [VSICONS_FILES, withoutCourierEntries(userSetting(VSICONS_FILES))],
    [VSICONS_FOLDERS, withoutCourierEntries(userSetting(VSICONS_FOLDERS))],
  ]);
  if (vsicons && (await usersOf(vsicons.extensionPath, icons).release()))
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
 * go too, when this profile put them in and no other profile on this
 * computer uses them. A profile that never put them in leaves them alone.
 *
 * @param icons - Courier's icons, and the profile that keeps them
 * @example
 * ```ts
 * await keepVsiconsCurrent(icons);
 * ```
 */
export async function keepVsiconsCurrent(icons: CourierIcons): Promise<void> {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  if (!vsicons) return;
  const theme = vsiconsTheme(vsicons);
  const users = usersOf(vsicons.extensionPath, icons);
  if (hasVsiconsIcons()) {
    const copied = await copyIcons(copiesFor(icons.dir));
    await users.add();
    /* Courier's own entries, where the settings hold them, as this Courier writes them: a newer one may add to them. */
    const current = [
      [VSICONS_FILES, VSICONS_PLAN.files],
      [VSICONS_FOLDERS, VSICONS_PLAN.folders],
    ] as const;
    const changes = current
      .filter(([key]) => hasCourierEntries(userSetting(key)))
      .map(([key, ours]): [string, unknown] => [key, withCourierEntries(userSetting(key), ours)]);
    await changeThemeSettings(theme, changes, copied);
    await builtAsWanted(theme, true);
    return;
  }
  /* A team's own settings may name Courier's icons for its workspace: in one trusted, they are copied for it. */
  if (sharedHere()) {
    if (await copyIcons(copiesFor(icons.dir))) await theme.apply?.();
    else await builtAsWanted(theme, true);
    return;
  }
  const anywhere = vscode.workspace.getConfiguration();
  const used = [VSICONS_FILES, VSICONS_FOLDERS].some((key) => hasCourierEntries(anywhere.get(key)));
  const last = (await users.has()) && (await users.release());
  /* vscode-icons rebuilds only when its settings change while it runs: taken out while the editor was closed, it is asked. */
  if (last && !used && (await removeCopies(copyPaths()))) await theme.apply?.();
  else await builtAsWanted(theme, false);
}

/*
 * vscode-icons' built theme, every profile's, as this profile's settings want it: built for another profile with
 * Courier's icons or without them, it is built again — vscode-icons does not look at its settings as it starts.
 */
async function builtAsWanted(theme: RebuiltTheme, wanted: boolean): Promise<void> {
  const built = await builtWithCourier(theme.files[0] ?? "", BUILT_MARK);
  if (built !== undefined && built !== wanted) await theme.apply?.();
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

/* Whether the settings of a workspace the user trusts hold Courier's entries for vscode-icons. */
function sharedHere(): boolean {
  return (
    vscode.workspace.isTrusted &&
    [VSICONS_FILES, VSICONS_FOLDERS].some((key) => hasCourierEntries(settingIn("workspace", key)))
  );
}

/* The profiles on this computer that use the copies in vscode-icons' custom icons folder. */
function usersOf(vsiconsDir: string, icons: CourierIcons): IconUsers {
  return iconUsers(dirname(vsiconsDir), customFolder(), icons.profile);
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
