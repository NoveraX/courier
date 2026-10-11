import { join } from "node:path";
import * as vscode from "vscode";

import type { CourierCore } from "../core/courier-core";
import { logFailure } from "../log/courier-log";
import { applyIcons, keepIconsCurrent, removeIcons } from "./apply-icons";
import { ICON_THEME_IDS, ICON_THEMES, type IconTheme } from "./icon-files";

/* The themes Courier's icons were put into, and the themes they were offered for, as the user's state keeps them. */
const APPLIED = "courier.fileIcons.themes";
const OFFERED = "courier.fileIcons.offered";

/**
 * Courier's own icons for `courier.config.*`, `courier.mocks.*` and the
 * `.courier` folder in the icon themes that take custom icons — Material
 * Icon Theme and vscode-icons: commands that put them in and take them out
 * through the user's settings, offered once per theme when it is the one in
 * use in a Courier project, and kept current as Courier updates.
 *
 * @param core - The extension's core
 * @returns What removes the commands
 * @example
 * ```ts
 * context.subscriptions.push(registerFileIcons(core));
 * ```
 */
export function registerFileIcons(core: CourierCore): vscode.Disposable {
  const state = core.context.globalState;
  const iconsDir = join(core.context.extensionPath, "media", "icons");
  const applied = () => state.get<IconTheme[]>(APPLIED, []);
  const show = async (asked?: unknown) => {
    const theme = isTheme(asked) ? asked : await chooseTheme();
    if (!theme) return;
    const why = await applyIcons(iconsDir, theme);
    if (why) {
      void vscode.window.showWarningMessage(why);
      return;
    }
    await state.update(APPLIED, [...new Set([...applied(), theme])]);
    void vscode.window.showInformationMessage(
      `Courier's icons are in ${ICON_THEMES[theme].label}. "Courier: Remove Courier's Icons from the File Icon Theme" takes them out.`,
    );
  };
  const remove = async () => {
    for (const theme of applied()) await removeIcons(theme);
    await state.update(APPLIED, []);
  };
  void Promise.all(applied().map((theme) => keepIconsCurrent(iconsDir, theme))).catch(
    (error: unknown) => logFailure("Courier could not keep its file icons current", error),
  );
  return vscode.Disposable.from(
    vscode.commands.registerCommand("courier.fileIcons.show", show),
    vscode.commands.registerCommand("courier.fileIcons.remove", remove),
    core.onRestart(() => void offerOnce(core, applied)),
  );
}

async function offerOnce(core: CourierCore, applied: () => readonly IconTheme[]): Promise<void> {
  const theme = themeInUse();
  const state = core.context.globalState;
  const offered = state.get<IconTheme[]>(OFFERED, []);
  if (!theme || offered.includes(theme) || applied().includes(theme)) return;
  if (!core.settings().get<boolean>("fileIcons.offer", true)) return;
  if ((await core.projects.list()).length === 0) return;
  await state.update(OFFERED, [...offered, theme]);
  const pick = await vscode.window.showInformationMessage(
    `Show Courier's own icons for courier.config.ts, courier.mocks.ts and .courier in ${ICON_THEMES[theme].label}?`,
    "Show Icons",
    "Not Now",
  );
  if (pick === "Show Icons") await vscode.commands.executeCommand("courier.fileIcons.show", theme);
}

/* The theme in use, when it takes Courier's icons; else one of those installed, as the user picks. */
async function chooseTheme(): Promise<IconTheme | undefined> {
  const inUse = themeInUse();
  if (inUse) return inUse;
  const installed = ICON_THEME_IDS.filter((theme) =>
    vscode.extensions.getExtension(ICON_THEMES[theme].extension),
  );
  if (installed.length === 0) {
    void vscode.window.showInformationMessage(
      "Courier's icons show in Material Icon Theme and vscode-icons, the icon themes that take custom icons; install one of them to see them.",
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    installed.map((theme) => ({ label: ICON_THEMES[theme].label, theme })),
    { title: "Show Courier's icons in" },
  );
  return picked?.theme;
}

function themeInUse(): IconTheme | undefined {
  const id = vscode.workspace.getConfiguration("workbench").get<string>("iconTheme");
  return ICON_THEME_IDS.find((theme) => ICON_THEMES[theme].theme === id);
}

function isTheme(value: unknown): value is IconTheme {
  return ICON_THEME_IDS.some((theme) => theme === value);
}
