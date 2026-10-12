import { join } from "node:path";
import * as vscode from "vscode";

import { isRecord } from "../studio/studio-guards";
import { copyIcons, removeCopies } from "./icon-copies";
import { ICON_FILES, ICON_THEMES } from "./icon-files";
import {
  type Associations,
  iconsHomeOf,
  isCourierIcon,
  MATERIAL_FILES,
  MATERIAL_FOLDERS,
  materialPlan,
  withCourier,
  withoutCourier,
} from "./material-icons";
import { changeThemeSettings, type RebuiltTheme } from "./theme-rewrites";
import { userSetting } from "./user-settings";

/**
 * Put Courier's icons into Material Icon Theme: copied into their folder
 * beside the theme, then the theme's associations to them, by file and by
 * folder, the user's own kept. The theme reads its settings again by
 * itself, each change once it has rebuilt itself for the one before.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @returns Why the theme cannot take them, or `undefined` once they are in
 * @example
 * ```ts
 * await applyMaterial(iconsDir);
 * ```
 */
export async function applyMaterial(iconsDir: string): Promise<string | undefined> {
  const material = vscode.extensions.getExtension(ICON_THEMES.material.extension);
  if (!material) return `${ICON_THEMES.material.label} is not installed.`;
  await copyIcons(copiesFor(iconsDir, material.extensionPath));
  const plan = materialPlan();
  await changeThemeSettings(materialTheme(material.extensionPath), [
    [MATERIAL_FILES, withCourier(associations(MATERIAL_FILES), plan.files)],
    [MATERIAL_FOLDERS, withCourier(associations(MATERIAL_FOLDERS), plan.folders)],
  ]);
  return undefined;
}

/**
 * Take Courier's icons out of Material Icon Theme: its associations, the
 * user's own kept, then the icons' folder beside the theme.
 *
 * @example
 * ```ts
 * await removeMaterial();
 * ```
 */
export async function removeMaterial(): Promise<void> {
  const material = vscode.extensions.getExtension(ICON_THEMES.material.extension);
  await changeThemeSettings(materialTheme(material?.extensionPath), [
    [MATERIAL_FILES, withoutCourier(associations(MATERIAL_FILES))],
    [MATERIAL_FOLDERS, withoutCourier(associations(MATERIAL_FOLDERS))],
  ]);
  if (material)
    await removeCopies(homeFiles(material.extensionPath), iconsHomeOf(material.extensionPath));
}

/**
 * Keep Courier's icons in Material Icon Theme as the user's settings say,
 * on this machine too: while the settings hold Courier's associations —
 * set here, or brought by Settings Sync from another machine — the icons
 * are copied beside the theme and every path Courier wrote points there,
 * one an older Courier wrote included; once they hold none — taken out
 * here or elsewhere — the copies go too.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @example
 * ```ts
 * await keepMaterialCurrent(iconsDir);
 * ```
 */
export async function keepMaterialCurrent(iconsDir: string): Promise<void> {
  const material = vscode.extensions.getExtension(ICON_THEMES.material.extension);
  if (!material) return;
  if (!hasMaterialIcons()) {
    await removeCopies(homeFiles(material.extensionPath), iconsHomeOf(material.extensionPath));
    return;
  }
  await copyIcons(copiesFor(iconsDir, material.extensionPath));
  const plan = materialPlan();
  await changeThemeSettings(materialTheme(material.extensionPath), [
    moved(MATERIAL_FILES, plan.files),
    moved(MATERIAL_FOLDERS, plan.folders),
  ]);
}

/**
 * Whether the user's settings hold Courier's associations for Material
 * Icon Theme.
 *
 * @returns Whether they do
 * @example
 * ```ts
 * if (hasMaterialIcons()) return;
 * ```
 */
export function hasMaterialIcons(): boolean {
  return [MATERIAL_FILES, MATERIAL_FOLDERS].some((key) =>
    Object.values(associations(key) ?? {}).some(isCourierIcon),
  );
}

/* Each icon Courier ships, by the path of its copy beside the theme. */
function copiesFor(iconsDir: string, materialDir: string): Map<string, string> {
  const home = iconsHomeOf(materialDir);
  return new Map(ICON_FILES.map((file) => [join(home, file), join(iconsDir, file)]));
}

/* The copies beside the theme. */
function homeFiles(materialDir: string): string[] {
  const home = iconsHomeOf(materialDir);
  return ICON_FILES.map((file) => join(home, file));
}

/* A setting with each association Courier set and the plan names otherwise moved to the plan's path. */
function moved(key: string, ours: Readonly<Record<string, string>>): [string, unknown] {
  const current = associations(key);
  const stale = Object.entries(ours).filter(
    ([name, icon]) => isCourierIcon(current?.[name]) && current?.[name] !== icon,
  );
  return [key, stale.length > 0 ? { ...current, ...Object.fromEntries(stale) } : current];
}

function associations(key: string): Associations | undefined {
  const value = userSetting(key);
  return isRecord(value) ? value : undefined;
}

/* Material Icon Theme's theme as it rewrites it; it reads its settings again on its own. */
function materialTheme(materialDir: string | undefined): RebuiltTheme {
  return { files: materialDir ? [join(materialDir, "dist", "material-icons.json")] : [] };
}
