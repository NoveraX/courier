import {
  applyMaterial,
  hasMaterialIcons,
  keepMaterialCurrent,
  removeMaterial,
} from "./apply-material";
import { applyVsicons, hasVsiconsIcons, keepVsiconsCurrent, removeVsicons } from "./apply-vsicons";
import type { CourierIcons, IconTheme } from "./icon-files";

/**
 * Put Courier's icons into an icon theme, through the user settings the
 * theme takes custom icons by: Material Icon Theme's associations to
 * Courier's icons beside it, or vscode-icons' associations and its custom
 * icons folder. The user's own associations stay.
 *
 * @param icons - Courier's icons, and the profile that puts them in
 * @param theme - The theme
 * @returns Why the theme cannot take them, or `undefined` once they are in
 * @example
 * ```ts
 * await applyIcons({ dir: join(extensionPath, "media", "icons"), profile }, "material");
 * ```
 */
export async function applyIcons(
  icons: CourierIcons,
  theme: IconTheme,
): Promise<string | undefined> {
  if (theme === "material") return applyMaterial(icons);
  await applyVsicons(icons);
  return undefined;
}

/**
 * Take Courier's icons out of every icon theme they are in: the
 * associations from the user's settings — which Settings Sync takes out on
 * the user's other machines too — the user's own kept, and the icons'
 * copies, unless another profile on this computer still uses them.
 *
 * @param icons - Courier's icons, and the profile that takes them out
 * @example
 * ```ts
 * await removeIcons(icons);
 * ```
 */
export async function removeIcons(icons: CourierIcons): Promise<void> {
  await removeMaterial(icons);
  await removeVsicons(icons);
}

/**
 * Keep Courier's icons in each icon theme as the user's settings say, on
 * this machine too: the icons copied and every path Courier wrote current
 * while the settings hold Courier's associations — brought by Settings
 * Sync, or written by an older Courier — and the copies taken away once
 * they hold none, by the profile that put them in, when no other profile
 * on this computer uses them.
 *
 * @param icons - Courier's icons, and the profile that keeps them
 * @example
 * ```ts
 * await keepIconsCurrent(icons);
 * ```
 */
export async function keepIconsCurrent(icons: CourierIcons): Promise<void> {
  await keepMaterialCurrent(icons);
  await keepVsiconsCurrent(icons);
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
