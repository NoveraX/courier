import { join } from "node:path";
import * as vscode from "vscode";

import { isRecord } from "../studio/studio-guards";
import { ICON_THEMES } from "./icon-files";
import {
  type Associations,
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
 * Put Courier's icons into Material Icon Theme: associations to the icons
 * Courier ships, by file and by folder, the user's own kept. The theme
 * reads its settings again by itself, each change once it has rebuilt
 * itself for the one before.
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
  const plan = materialPlan(iconsDir, material.extensionPath);
  if ("why" in plan) return plan.why;
  await changeThemeSettings(materialTheme(material.extensionPath), [
    [MATERIAL_FILES, withCourier(associations(MATERIAL_FILES), plan.files)],
    [MATERIAL_FOLDERS, withCourier(associations(MATERIAL_FOLDERS), plan.folders)],
  ]);
  return undefined;
}

/**
 * Take Courier's associations out of Material Icon Theme's, the user's own kept.
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
}

/**
 * Move Courier's associations to the folder of the Courier installed now:
 * the paths name the folder of the version that set them, and an older
 * Courier may have written a path the theme reads otherwise. What the user
 * took out stays out.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @example
 * ```ts
 * await keepMaterialCurrent(iconsDir);
 * ```
 */
export async function keepMaterialCurrent(iconsDir: string): Promise<void> {
  const material = vscode.extensions.getExtension(ICON_THEMES.material.extension);
  const plan = material && materialPlan(iconsDir, material.extensionPath);
  if (!material || !plan || "why" in plan) return;
  await changeThemeSettings(materialTheme(material.extensionPath), [
    moved(MATERIAL_FILES, plan.files),
    moved(MATERIAL_FOLDERS, plan.folders),
  ]);
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
