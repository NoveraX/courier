import { dirname, join, relative, sep } from "node:path";

import { CONFIG_FILES, ICONS, MOCKS_FILES, STATE_FOLDER } from "./icon-files";

/** Material Icon Theme's settings that take icons by a file's name and by a folder's. */
export const MATERIAL_FILES = "material-icon-theme.files.associations";
export const MATERIAL_FOLDERS = "material-icon-theme.folders.associations";

/** A setting that maps names to icons: the user's own, and maybe Courier's. */
export type Associations = Readonly<Record<string, unknown>>;

/** Courier's associations for Material Icon Theme. */
export interface MaterialPlan {
  readonly files: Readonly<Record<string, string>>;
  readonly folders: Readonly<Record<string, string>>;
}

/**
 * Courier's associations for Material Icon Theme: each config and mocks
 * file, and the `.courier` folder, to Courier's icon — by its path from the
 * theme's `dist` folder without `.svg`, as the theme takes custom icons.
 * The theme takes them only from the editor's extensions folder, where an
 * installed Courier is; one run from elsewhere gets the reason instead.
 *
 * @param iconsDir - Courier's `media/icons` folder
 * @param materialDir - Where Material Icon Theme is installed
 * @returns The associations, or why the theme cannot take them
 * @example
 * ```ts
 * materialPlan(join(extensionPath, "media", "icons"), material.extensionPath);
 * // { files: { "courier.config.ts": "../../noverax.courier-vscode-1.0.0/media/icons/courier-config", … }, … }
 * ```
 */
export function materialPlan(
  iconsDir: string,
  materialDir: string,
): MaterialPlan | { readonly why: string } {
  if (relative(dirname(materialDir), iconsDir).startsWith("..")) {
    return {
      why: "Material Icon Theme takes icons only from the editor's extensions folder, and this Courier runs from elsewhere.",
    };
  }
  const from = join(materialDir, "dist");
  const path = (icon: string) => relative(from, join(iconsDir, icon)).split(sep).join("/");
  return {
    files: Object.fromEntries([
      ...CONFIG_FILES.map((name): [string, string] => [name, path(ICONS.config)]),
      ...MOCKS_FILES.map((name): [string, string] => [name, path(ICONS.mocks)]),
    ]),
    folders: { [STATE_FOLDER]: path(ICONS.folder) },
  };
}

/**
 * The associations with Courier's in: each set where the user has none of
 * their own for that name, and moved where an older Courier set it.
 *
 * @param current - The setting as the user has it
 * @param ours - Courier's associations
 * @returns The setting to write
 * @example
 * ```ts
 * withCourier({ "*.sample": "../../icons/sample" }, plan.files);
 * ```
 */
export function withCourier(
  current: Associations | undefined,
  ours: Readonly<Record<string, string>>,
): Associations {
  const merged: Record<string, unknown> = { ...current };
  for (const [name, icon] of Object.entries(ours)) {
    const theirs = merged[name];
    if (theirs === undefined || isCourierIcon(theirs)) merged[name] = icon;
  }
  return merged;
}

/**
 * The associations with Courier's taken out, the user's own kept.
 *
 * @param current - The setting as the user has it
 * @returns The setting to write, `undefined` when nothing is left
 * @example
 * ```ts
 * withoutCourier(settings.inspect(MATERIAL_FILES)?.globalValue);
 * ```
 */
export function withoutCourier(current: Associations | undefined): Associations | undefined {
  const kept = Object.entries(current ?? {}).filter(([, icon]) => !isCourierIcon(icon));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * Whether an association is one Courier set: a path to one of its icons,
 * from any version of it.
 *
 * @param icon - The association's value
 * @returns Whether Courier set it
 * @example
 * ```ts
 * isCourierIcon("../../noverax.courier-vscode-1.0.0/media/icons/courier-config"); // true
 * ```
 */
export function isCourierIcon(icon: unknown): boolean {
  return typeof icon === "string" && COURIER_ICON.test(icon);
}

const COURIER_ICON = new RegExp(`/media/icons/(${Object.values(ICONS).join("|")})$`);
