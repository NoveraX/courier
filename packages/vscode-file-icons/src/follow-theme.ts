import * as vscode from "vscode";

import { applyIcons, hasCourierIcons } from "./apply-icons";
import { type CourierIcons, ICON_THEME_IDS, ICON_THEMES } from "./icon-files";
import { AUTOMATIC, automatic, SHOW_ICONS } from "./icons-choice";
import { iconsLog } from "./icons-log";
import type { PutInNotice } from "./put-in-notice";
import { notHere, themeInUse } from "./theme-reach";
import { TAKES_NONE } from "./where-icons-show";

/** What following the icon theme in use needs. */
export interface Following {
  /** Courier's icons, and the profile that puts them in */
  readonly icons: CourierIcons;
  /** The message that the icons went in by themselves */
  readonly notice: PutInNotice;
  /** The lines this window's log has had, said once however many passes meet them */
  readonly told: Set<string>;
}

/**
 * Courier's icons for the icon theme in use. A theme that takes none —
 * VS Code's own Seti among them — said once in the log, with those that
 * do; in it already, nothing to do; running elsewhere than here, said
 * once in the log; while the user lets them go in by themselves — the
 * default, until they take them out — carried over without a word from
 * the other theme they are in, or put in where they are in no theme yet
 * and said once, with the way to take them out. A change to the icons:
 * made in turn with the others.
 *
 * @param following - Courier's icons, the message, the log's lines
 * @example
 * ```ts
 * await inTurn("Courier could not follow the icon theme in use", () => followThemeInUse(following));
 * ```
 */
export async function followThemeInUse({ icons, notice, told }: Following): Promise<void> {
  const theme = themeInUse();
  if (!theme) {
    logOnce(told, TAKES_NONE);
    return;
  }
  if (hasCourierIcons(theme)) return;
  const { label, extension } = ICON_THEMES[theme];
  if (!vscode.extensions.getExtension(extension)) {
    logOnce(told, notHere(theme));
    return;
  }
  if (!automatic()) {
    logOnce(
      told,
      `Courier's icons are not in ${label}, the icon theme in use, and go in only by "${SHOW_ICONS}": ${AUTOMATIC} is off.`,
    );
    return;
  }
  const first = !ICON_THEME_IDS.some(hasCourierIcons);
  const decidedAt = Date.now();
  const why = await applyIcons(icons, theme);
  if (why) iconsLog().info(why);
  else if (first) notice.tell(theme, decidedAt);
  else iconsLog().info(`Courier's icons went into ${label}, the icon theme in use`);
}

function logOnce(told: Set<string>, line: string): void {
  if (told.has(line)) return;
  told.add(line);
  iconsLog().info(line);
}
