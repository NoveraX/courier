import * as vscode from "vscode";

/**
 * A setting as the user's own settings hold it — not a workspace's, nor
 * the default.
 *
 * @param key - The setting's full key
 * @returns Its value in the user's settings
 * @example
 * ```ts
 * userSetting("vsicons.associations.files");
 * ```
 */
export function userSetting(key: string): unknown {
  return vscode.workspace.getConfiguration().inspect(key)?.globalValue;
}

/**
 * Write a setting to the user's own settings — `undefined` takes it out —
 * unless it already holds that value, which would change nothing.
 *
 * @param key - The setting's full key
 * @param value - Its new value
 * @returns Whether it changed
 * @example
 * ```ts
 * await writeUserSetting("material-icon-theme.files.associations", associations);
 * ```
 */
export async function writeUserSetting(key: string, value: unknown): Promise<boolean> {
  if (JSON.stringify(userSetting(key)) === JSON.stringify(value)) return false;
  await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
  return true;
}
