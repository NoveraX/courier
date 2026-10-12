import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

import type { RebuiltTheme } from "./theme-rewrites";
import { userSetting } from "./user-settings";
import { VSICONS_APPLY, VSICONS_FOLDER_PATH, vsiconsFolder } from "./vscode-icons";

/**
 * vscode-icons' theme as it rewrites it, and its own command that applies
 * its settings — started first when it has not started, or it would hear
 * nothing.
 *
 * @param vsicons - vscode-icons, where it runs beside this extension
 * @returns The theme
 * @example
 * ```ts
 * await changeThemeSettings(vsiconsTheme(vsicons), changes);
 * ```
 */
export function vsiconsTheme(vsicons: vscode.Extension<unknown> | undefined): RebuiltTheme {
  const folder = vsicons && join(vsicons.extensionPath, "dist", "src");
  return {
    files: folder
      ? [join(folder, "vsicons-icon-theme.json"), join(folder, "vsicons-icon-theme-zed.json")]
      : [],
    async apply() {
      if (!vsicons) return;
      /* Asked before it started, vscode-icons would hear nothing: it is started first, and asked once its own start is done. */
      if (!vsicons.isActive) await vsicons.activate();
      if ((await vscode.commands.getCommands(true)).includes(VSICONS_APPLY)) {
        await vscode.commands.executeCommand(VSICONS_APPLY);
      }
    },
  };
}

/**
 * The folder vscode-icons reads custom icons from, as the settings in use
 * name it — the user's alone in a workspace not trusted, which does not
 * choose where Courier writes.
 *
 * @returns The `vsicons-custom-icons` folder
 * @example
 * ```ts
 * join(customFolder(), "file_type_courier-config.svg");
 * ```
 */
export function customFolder(): string {
  const setting = vscode.workspace.isTrusted
    ? vscode.workspace.getConfiguration().get<unknown>(VSICONS_FOLDER_PATH)
    : userSetting(VSICONS_FOLDER_PATH);
  return vsiconsFolder({
    setting: typeof setting === "string" ? setting : "",
    workspaces: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    appName: vscode.env.appName,
    platform: process.platform,
    env: process.env,
    home: homedir(),
  });
}
