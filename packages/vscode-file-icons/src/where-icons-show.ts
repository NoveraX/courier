import * as vscode from "vscode";

import { hasCourierIcons } from "./apply-icons";
import { themeInUse } from "./theme-reach";

/** The log's line when the icon theme in use is neither of those that take Courier's icons — VS Code's own Seti, say. */
export const TAKES_NONE =
  "The icon theme in use takes no custom icons: Courier's icons show in Material Icon Theme and vscode-icons.";
const CHOOSE = "Choose a File Icon Theme";
/* The context the walkthrough's step about Courier's icons is done by. */
const IN_THEME = "courier.fileIconsInTheme";

/**
 * Tell the user, who asked for Courier's icons while the icon theme in use
 * takes none, which themes take them — with the editor's own picker of
 * file icon themes a click away, which installs one too. The user picks:
 * the extension never changes the theme in use.
 *
 * @example
 * ```ts
 * if (!themeInUse()) pointToIconThemes();
 * ```
 */
export function pointToIconThemes(): void {
  vscode.window
    .showInformationMessage(
      "The icon theme in use takes no custom icons. Courier's icons show in Material Icon Theme and vscode-icons: choose one of them, and they go in.",
      CHOOSE,
    )
    .then((pick) => {
      if (pick === CHOOSE) void vscode.commands.executeCommand("workbench.action.selectIconTheme");
    });
}

/** The context that says whether Courier's icons are in the icon theme in use. */
export interface InThemeContext {
  /** Say it again, when it changed since it was last said */
  tell(): Promise<void>;
}

/**
 * The context that says whether Courier's icons are in the icon theme in
 * use — `courier.fileIconsInTheme`, which marks Courier's walkthrough step
 * about them done once they show.
 *
 * @returns How to say it
 * @example
 * ```ts
 * const inTheme = inThemeContext();
 * await inTheme.tell();
 * ```
 */
export function inThemeContext(): InThemeContext {
  /* A context not said yet reads as false. */
  let told = false;
  return {
    async tell() {
      const theme = themeInUse();
      const inTheme = theme !== undefined && hasCourierIcons(theme);
      if (inTheme === told) return;
      told = inTheme;
      await vscode.commands.executeCommand("setContext", IN_THEME, inTheme);
    },
  };
}
