import { join } from "node:path";
import * as vscode from "vscode";

import type { CourierCore } from "../core/courier-core";
import { courierLog, logFailure } from "../log/courier-log";
import { applyIcons, hasCourierIcons, keepIconsCurrent, removeIcons } from "./apply-icons";
import { ICON_THEME_IDS, ICON_THEMES, type IconTheme } from "./icon-files";
import { MATERIAL_FILES, MATERIAL_FOLDERS } from "./material-icons";
import { VSICONS_FILES, VSICONS_FOLDERS } from "./vscode-icons";

/* The themes Courier's icons were offered for on this machine, as its state keeps them. */
const OFFERED = "courier.fileIcons.offered";
/* The settings that say Courier's icons are in a theme — which Settings Sync brings from the user's other machines. */
const ASSOCIATIONS = [MATERIAL_FILES, MATERIAL_FOLDERS, VSICONS_FILES, VSICONS_FOLDERS];
/* Settings Sync writes settings one after another; the icons are kept current once they have all arrived. */
const SETTLE_MS = 1_500;

/**
 * Courier's own icons for `courier.config.*`, `courier.mocks.*` and the
 * `.courier` folder in the icon themes that take custom icons — Material
 * Icon Theme and vscode-icons, each in its own style. The user agrees
 * once: an offer when such a theme is the one in use in a Courier project
 * — as Courier starts, or when the user picks it later — or the command.
 * From then on the icons follow the user by themselves: into the other
 * theme when the user picks it, onto every machine Settings Sync brings
 * the settings to, across Courier's updates, and out again everywhere
 * when taken out.
 *
 * @param core - The extension's core
 * @returns What removes the commands
 * @example
 * ```ts
 * context.subscriptions.push(registerFileIcons(core));
 * ```
 */
export function registerFileIcons(core: CourierCore): vscode.Disposable {
  const iconsDir = join(core.context.extensionPath, "media", "icons");
  /* One change to the icons at a time: the themes rebuild on each, and an offer, a command and a sync may come together. */
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = (what: string, change: () => Promise<unknown>) => {
    queue = queue.then(change).catch((error: unknown) => logFailure(what, error));
    return queue;
  };
  const show = async (asked?: unknown) => {
    const theme = isTheme(asked) ? asked : await chooseTheme();
    if (!theme) return;
    await inTurn("Courier could not put its file icons in", async () => {
      const why = await applyIcons(iconsDir, theme);
      if (why) void vscode.window.showWarningMessage(why);
      else
        void vscode.window.showInformationMessage(
          `Courier's icons are in ${ICON_THEMES[theme].label}. "Courier: Remove Courier's Icons from the File Icon Theme" takes them out.`,
        );
    });
  };
  const remove = () =>
    inTurn("Courier could not take its file icons out", async () => {
      await removeIcons();
      void vscode.window.showInformationMessage("Courier's icons are out of the file icon themes.");
    });
  const keep = () =>
    inTurn("Courier could not keep its file icons current", () => keepIconsCurrent(iconsDir));
  /* Agreed to in one theme, the icons go into the one picked next, in its own style, without asking again. */
  const carry = (theme: IconTheme) =>
    inTurn("Courier could not put its file icons in", async () => {
      const why = await applyIcons(iconsDir, theme);
      courierLog().info(
        why ?? `Courier's icons went into ${ICON_THEMES[theme].label}, the icon theme in use`,
      );
    });
  const follow = () => void followThemeInUse(core, carry);
  let settling: ReturnType<typeof setTimeout> | undefined;
  void keep();
  return vscode.Disposable.from(
    vscode.commands.registerCommand("courier.fileIcons.show", show),
    vscode.commands.registerCommand("courier.fileIcons.remove", remove),
    core.onRestart(follow),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("workbench.iconTheme")) follow();
      if (!ASSOCIATIONS.some((key) => change.affectsConfiguration(key))) return;
      clearTimeout(settling);
      settling = setTimeout(() => void keep(), SETTLE_MS);
    }),
    { dispose: () => clearTimeout(settling) },
  );
}

/*
 * The icons for the theme in use: in already, nothing to do; agreed to in the other theme, carried over;
 * agreed to nowhere, offered — once per theme.
 */
async function followThemeInUse(
  core: CourierCore,
  carry: (theme: IconTheme) => Promise<unknown>,
): Promise<void> {
  const theme = themeInUse();
  if (!theme || hasCourierIcons(theme)) return;
  if (ICON_THEME_IDS.some((other) => hasCourierIcons(other))) {
    await carry(theme);
    return;
  }
  const state = core.context.globalState;
  const offered = state.get<IconTheme[]>(OFFERED, []);
  if (offered.includes(theme)) return;
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
