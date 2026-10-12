import {
  applyMaterial,
  hasMaterialIcons,
  keepMaterialCurrent,
  removeMaterial,
} from "./apply-material";
import { applyVsicons, hasVsiconsIcons, keepVsiconsCurrent, removeVsicons } from "./apply-vsicons";
import type { IconTheme } from "./icon-files";

/**
 * Put Courier's icons into an icon theme, through the user settings the
 * theme takes custom icons by: Material Icon Theme's associations to
 * Courier's icons beside it, or vscode-icons' associations and its custom
 * icons folder. The user's own associations stay.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @param theme - The theme
 * @returns Why the theme cannot take them, or `undefined` once they are in
 * @example
 * ```ts
 * await applyIcons(join(extensionPath, "media", "icons"), "material");
 * ```
 */
export async function applyIcons(iconsDir: string, theme: IconTheme): Promise<string | undefined> {
  if (theme === "material") return applyMaterial(iconsDir);
  await applyVsicons(iconsDir);
  return undefined;
}

/**
 * Take Courier's icons out of every icon theme they are in: the
 * associations from the user's settings — which Settings Sync takes out on
 * the user's other machines too — the user's own kept, and the icons'
 * copies.
 *
 * @example
 * ```ts
 * await removeIcons();
 * ```
 */
export async function removeIcons(): Promise<void> {
  await removeMaterial();
  await removeVsicons();
}

/**
 * Keep Courier's icons in each icon theme as the user's settings say, on
 * this machine too: the icons copied and every path Courier wrote current
 * while the settings hold Courier's associations — brought by Settings
 * Sync, or written by an older Courier — and the copies taken away once
 * they hold none.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @example
 * ```ts
 * await keepIconsCurrent(iconsDir);
 * ```
 */
export async function keepIconsCurrent(iconsDir: string): Promise<void> {
  await keepMaterialCurrent(iconsDir);
  await keepVsiconsCurrent(iconsDir);
}

/**
 * Whether the user's settings already hold Courier's icons for a theme —
 * put in here, or brought by Settings Sync from another machine.
 *
 * @param theme - The theme
 * @returns Whether they do
 * @example
 * ```ts
 * if (hasCourierIcons("vsicons")) return;
 * ```
 */
export function hasCourierIcons(theme: IconTheme): boolean {
  return theme === "material" ? hasMaterialIcons() : hasVsiconsIcons();
}
