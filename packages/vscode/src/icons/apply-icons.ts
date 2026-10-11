import { applyMaterial, keepMaterialCurrent, removeMaterial } from "./apply-material";
import { applyVsicons, keepVsiconsCurrent, removeVsicons } from "./apply-vsicons";
import type { IconTheme } from "./icon-files";

/**
 * Put Courier's icons into an icon theme, through the user settings the
 * theme takes custom icons by: Material Icon Theme's associations to the
 * icons Courier ships, or vscode-icons' associations and its custom icons
 * folder. The user's own associations stay.
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
 * Take Courier's icons out of an icon theme: its associations from the
 * user settings — the user's own kept — and, for vscode-icons, its icons
 * from the custom icons folder.
 *
 * @param theme - The theme
 * @example
 * ```ts
 * await removeIcons("vsicons");
 * ```
 */
export async function removeIcons(theme: IconTheme): Promise<void> {
  await (theme === "material" ? removeMaterial() : removeVsicons());
}

/**
 * Keep the icons Courier put into a theme current after Courier updated:
 * Material Icon Theme's paths name the folder of Courier's version, and
 * vscode-icons keeps copies. What the user took out stays out.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @param theme - The theme the icons were put into
 * @example
 * ```ts
 * await keepIconsCurrent(iconsDir, "material");
 * ```
 */
export async function keepIconsCurrent(iconsDir: string, theme: IconTheme): Promise<void> {
  await (theme === "material" ? keepMaterialCurrent(iconsDir) : keepVsiconsCurrent(iconsDir));
}
