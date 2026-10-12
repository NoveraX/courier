import * as vscode from "vscode";

import { ICON_THEMES } from "./icon-files";
import { themeInUse } from "./theme-reach";
import { changeThemeSettings } from "./theme-rewrites";
import { settingIn } from "./user-settings";
import {
  hasCourierEntries,
  VSICONS_FILES,
  VSICONS_FOLDERS,
  VSICONS_PLAN,
  withCourierEntries,
} from "./vscode-icons";
import { vsiconsTheme } from "./vsicons-theme";

/* Whether the workspace open was told once already. */
const TOLD = "courier.fileIcons.hiddenHereTold";
const ADD = "Add Courier's Icons Here";
const OPEN = "Open Folder Settings";
const OURS = { [VSICONS_FILES]: VSICONS_PLAN.files, [VSICONS_FOLDERS]: VSICONS_PLAN.folders };

/**
 * The vscode-icons settings the workspace open holds associations of its
 * own in, Courier's not among them, while the user's hold Courier's: a
 * list in a workspace's settings takes the place of the user's, so there
 * Courier's icons do not show.
 *
 * @returns The settings' full keys
 * @example
 * ```ts
 * hiddenHere(); // ["vsicons.associations.files"]
 * ```
 */
export function hiddenHere(): (keyof typeof OURS)[] {
  return ([VSICONS_FILES, VSICONS_FOLDERS] as const).filter((key) => {
    const workspace = settingIn("workspace", key);
    return (
      Array.isArray(workspace) &&
      !hasCourierEntries(workspace) &&
      hasCourierEntries(settingIn("user", key))
    );
  });
}

/**
 * Courier's entries added to the workspace's own vscode-icons settings
 * that hide them, after the workspace's — in its settings file, which the
 * team may share.
 *
 * @param keys - The settings' full keys
 * @example
 * ```ts
 * await showHere(hiddenHere());
 * ```
 */
export async function showHere(keys: readonly (keyof typeof OURS)[]): Promise<void> {
  const vsicons = vscode.extensions.getExtension(ICON_THEMES.vsicons.extension);
  const changes = keys.map((key): [string, unknown] => [
    key,
    withCourierEntries(settingIn("workspace", key), OURS[key]),
  ]);
  await changeThemeSettings(vsiconsTheme(vsicons), changes, false, "workspace");
}

/**
 * Tell the user, once per workspace, when its own vscode-icons settings
 * hide Courier's icons there — with vscode-icons the theme in use — and
 * offer to add them to the workspace's settings, or to open those.
 *
 * @param state - The workspace's state, which keeps that it was told
 * @param add - What adds Courier's entries to the workspace's settings
 * @example
 * ```ts
 * await tellHiddenHere(context.workspaceState, (keys) => inTurn("…", () => showHere(keys)));
 * ```
 */
export async function tellHiddenHere(
  state: vscode.Memento,
  add: (keys: readonly (keyof typeof OURS)[]) => Promise<unknown>,
): Promise<void> {
  if (themeInUse() !== "vsicons" || state.get<boolean>(TOLD, false)) return;
  const keys = hiddenHere();
  if (keys.length === 0) return;
  await state.update(TOLD, true);
  const pick = await vscode.window.showInformationMessage(
    "This folder's settings give vscode-icons associations of their own, which take the place of yours here, so Courier's icons do not show in it.",
    ADD,
    OPEN,
  );
  if (pick === ADD) await add(keys);
  else if (pick === OPEN)
    await vscode.commands.executeCommand("workbench.action.openWorkspaceSettingsFile");
}
