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
import { userSetting, writeUserSetting } from "./user-settings";

/**
 * Put Courier's icons into Material Icon Theme: associations to the icons
 * Courier ships, by file and by folder, the user's own kept. The theme
 * reads its settings again by itself.
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
  await writeUserSetting(MATERIAL_FILES, withCourier(associations(MATERIAL_FILES), plan.files));
  await writeUserSetting(
    MATERIAL_FOLDERS,
    withCourier(associations(MATERIAL_FOLDERS), plan.folders),
  );
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
  await writeUserSetting(MATERIAL_FILES, withoutCourier(associations(MATERIAL_FILES)));
  await writeUserSetting(MATERIAL_FOLDERS, withoutCourier(associations(MATERIAL_FOLDERS)));
}

/**
 * Move Courier's associations to the folder of the Courier installed now:
 * the paths name the folder of the version that set them. What the user
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
  if (!plan || "why" in plan) return;
  for (const [key, ours] of [
    [MATERIAL_FILES, plan.files],
    [MATERIAL_FOLDERS, plan.folders],
  ] as const) {
    const current = associations(key);
    const moved = Object.entries(ours).filter(
      ([name, icon]) => isCourierIcon(current?.[name]) && current?.[name] !== icon,
    );
    if (moved.length > 0) await writeUserSetting(key, { ...current, ...Object.fromEntries(moved) });
  }
}

function associations(key: string): Associations | undefined {
  const value = userSetting(key);
  return isRecord(value) ? value : undefined;
}
