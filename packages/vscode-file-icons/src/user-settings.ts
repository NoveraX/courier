import * as vscode from "vscode";

/** The settings Courier File Icons reads and writes: the user's own, or those of the workspace open. */
export type SettingsScope = "user" | "workspace";

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
  return settingIn("user", key);
}

/**
 * A setting as one scope of settings holds it: the user's own, or the
 * workspace's — nor the default, nor the other scope's.
 *
 * @param scope - Whose settings
 * @param key - The setting's full key
 * @returns Its value there
 * @example
 * ```ts
 * settingIn("workspace", "vsicons.associations.files");
 * ```
 */
export function settingIn(scope: SettingsScope, key: string): unknown {
  const values = vscode.workspace.getConfiguration().inspect(key);
  return scope === "user" ? values?.globalValue : values?.workspaceValue;
}

/**
 * Write a setting to the user's own settings, or the workspace's —
 * `undefined` takes it out — unless it already holds that value, which
 * would change nothing.
 *
 * @param key - The setting's full key
 * @param value - Its new value
 * @param scope - Whose settings: the user's unless said
 * @returns Whether it changed
 * @example
 * ```ts
 * await writeSetting("material-icon-theme.files.associations", associations);
 * ```
 */
export async function writeSetting(
  key: string,
  value: unknown,
  scope: SettingsScope = "user",
): Promise<boolean> {
  if (JSON.stringify(settingIn(scope, key)) === JSON.stringify(value)) return false;
  const target =
    scope === "user" ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
  await vscode.workspace.getConfiguration().update(key, value, target);
  return true;
}
