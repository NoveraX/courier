import type * as vscode from "vscode";

import { hasCourierIcons } from "./apply-icons";
import { ICON_THEME_IDS, ICON_THEMES, type IconTheme } from "./icon-files";
import { iconsLog } from "./icons-log";
import { userSetting, writeSetting } from "./user-settings";

/** The setting that says whether Courier's icons go into the icon theme in use by themselves. */
export const AUTOMATIC = "courier.fileIcons.automatic";
/** The command that puts Courier's icons in when the user asks, by the name the Command Palette shows. */
export const SHOW_ICONS = "Courier: Show Courier's Icons in the File Icon Theme";
/* What Courier File Icons 0.4, which asked first, kept of the user's answers: its offer turned off, and the themes it offered the icons for. */
const OFFER = "courier.fileIcons.offer";
const OFFERED = "courier.fileIcons.offered";

/**
 * Whether Courier's icons go into the icon theme in use by themselves — as
 * the editor starts, and into each theme the user picks — as the user's own
 * settings say. A workspace's settings never decide what goes into the
 * user's.
 *
 * @returns Whether they do
 * @example
 * ```ts
 * if (!automatic()) return;
 * ```
 */
export function automatic(): boolean {
  return userSetting(AUTOMATIC) !== false;
}

/**
 * Say in the user's settings whether Courier's icons go in by themselves
 * from now on — off once the user takes them out, on again, the default,
 * once they show them — where Settings Sync takes it to their other
 * machines together with the icons' own settings.
 *
 * @param on - Whether they do
 * @example
 * ```ts
 * await setAutomatic(false);
 * ```
 */
export async function setAutomatic(on: boolean): Promise<void> {
  await writeSetting(AUTOMATIC, on ? undefined : false);
}

/**
 * Keep Courier's icons out once the user's settings lost them for a theme
 * while they went in by themselves — taken out by hand, in another window,
 * or by Settings Sync from another machine, an older Courier's among them:
 * `courier.fileIcons.automatic` turned off, which Settings Sync carries to
 * the user's other machines too, so that none puts them back.
 *
 * @param themes - The themes whose settings lost them
 * @example
 * ```ts
 * await keepTakenOut(["vsicons"]);
 * ```
 */
export async function keepTakenOut(themes: readonly IconTheme[]): Promise<void> {
  if (!automatic()) return;
  await setAutomatic(false);
  const labels = themes.map((theme) => ICON_THEMES[theme].label).join(" and ");
  iconsLog().info(
    `Courier's icons are out of the settings of ${labels}, so they go back in only by "${SHOW_ICONS}"`,
  );
}

/**
 * Keep the answers the user gave Courier File Icons 0.4 — which asked
 * before it put the icons in — as the choice they make now, once, the old
 * keys taken away. Its offer turned off in the user's settings, or a theme
 * offered while the icons are in none — a "Not Now", the offer closed, or
 * the icons taken out after a yes — turns `courier.fileIcons.automatic`
 * off.
 *
 * @param state - The profile's state, which kept the themes offered
 * @example
 * ```ts
 * await keepEarlierChoice(context.globalState);
 * ```
 */
export async function keepEarlierChoice(state: vscode.Memento): Promise<void> {
  const offered = state.get<unknown>(OFFERED);
  const declined =
    userSetting(OFFER) === false ||
    (Array.isArray(offered) && offered.length > 0 && !ICON_THEME_IDS.some(hasCourierIcons));
  if (declined) await setAutomatic(false);
  await writeSetting(OFFER, undefined);
  if (offered !== undefined) await state.update(OFFERED, undefined);
}
