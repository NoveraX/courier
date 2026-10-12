import { dirname, join } from "node:path";

import { CONFIG_FILES, ICONS, ICONS_HOME, MOCKS_FILES, STATE_FOLDER } from "./icon-files";

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
 * file, and the `.courier` folder, to Courier's icon in its folder beside
 * the theme's own — by its path without `.svg`, as the theme takes custom
 * icons: from the theme's `icons` folder for a file; and for a folder,
 * whose icon the theme names `folder-` and the path, from one folder
 * deeper, as the theme's own docs write it. The paths name no version of
 * Courier, so they stay the same across updates and across machines.
 *
 * @returns The associations
 * @example
 * ```ts
 * materialPlan();
 * // { files: { "courier.config.ts": "../../.noverax-courier-icons/courier-config", … },
 * //   folders: { ".courier": "../../../../.noverax-courier-icons/folder-courier" } }
 * ```
 */
export function materialPlan(): MaterialPlan {
  /* From the theme's icons folder, two folders up is the extensions folder that holds Courier's. */
  const path = (icon: string) => `../../${ICONS_HOME}/${icon}`;
  return {
    files: Object.fromEntries([
      ...CONFIG_FILES.map((name): [string, string] => [name, path(ICONS.config)]),
      ...MOCKS_FILES.map((name): [string, string] => [name, path(ICONS.mocks)]),
    ]),
    /* `folder-../` is a folder of its own name, which one more `../` leaves. */
    folders: { [STATE_FOLDER]: `../../${path(ICONS.folder)}` },
  };
}

/**
 * The folder that keeps Courier's icons for Material Icon Theme: beside the
 * theme, in the editor's extensions folder, where the theme reads them.
 *
 * @param materialDir - Where Material Icon Theme is installed
 * @returns The folder
 * @example
 * ```ts
 * iconsHomeOf(material.extensionPath); // "~/.vscode/extensions/.noverax-courier-icons"
 * ```
 */
export function iconsHomeOf(materialDir: string): string {
  return join(dirname(materialDir), ICONS_HOME);
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
 * in its folder of icons or in the media of any version of it.
 *
 * @param icon - The association's value
 * @returns Whether Courier set it
 * @example
 * ```ts
 * isCourierIcon("../../.noverax-courier-icons/courier-config"); // true
 * ```
 */
export function isCourierIcon(icon: unknown): boolean {
  return typeof icon === "string" && COURIER_ICON.test(icon);
}

/* A path to one of Courier's icons: in its folder of icons, or in the media of a Courier of any version, as an older one wrote it. */
const COURIER_ICON = new RegExp(
  `/(media/icons|${ICONS_HOME.replace(".", "\\.")})/(${Object.values(ICONS).join("|")})$`,
);
