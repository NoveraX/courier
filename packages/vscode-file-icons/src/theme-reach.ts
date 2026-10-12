import * as vscode from "vscode";

import { ICON_THEMES, type IconTheme } from "./icon-files";

/**
 * Why an icon theme takes no icons from here: it does not run where this
 * extension runs — on this computer, beside the editor's window. Outside a
 * remote window, it is not installed; in one, it may run on the remote
 * machine, whose files the theme reads its icons from and this extension
 * cannot write.
 *
 * @param theme - The theme
 * @returns What to tell the user
 * @example
 * ```ts
 * if (!material) return notHere("material"); // "Material Icon Theme is not installed."
 * ```
 */
export function notHere(theme: IconTheme): string {
  const { label } = ICON_THEMES[theme];
  if (!vscode.env.remoteName) return `${label} is not installed.`;
  return `${label} does not run on this computer in this remote window, so Courier's icons cannot go into it from here. Install ${label} on this computer as well: VS Code then runs it here, beside Courier File Icons, which puts the icons in.`;
}
