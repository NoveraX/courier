import { join } from "node:path";
import * as vscode from "vscode";

import { applyIcons, keepIconsCurrent, removeIcons, themesHoldingIcons } from "./apply-icons";
import { changesInTurn } from "./changes-in-turn";
import { type Following, followThemeInUse } from "./follow-theme";
import { showHere, tellHiddenHere } from "./hidden-here";
import { type CourierIcons, ICON_THEMES } from "./icon-files";
import { profileOf } from "./icon-users";
import {
  AUTOMATIC,
  keepEarlierChoice,
  keepTakenOut,
  SHOW_ICONS,
  setAutomatic,
} from "./icons-choice";
import { logFailure } from "./icons-log";
import { MATERIAL_FILES, MATERIAL_FOLDERS } from "./material-icons";
import { putInNotice } from "./put-in-notice";
import { themeInUse } from "./theme-reach";
import { VSICONS_FILES, VSICONS_FOLDERS } from "./vscode-icons";
import { inThemeContext, pointToIconThemes } from "./where-icons-show";

/* The settings that say Courier's icons are in a theme — which Settings Sync brings from the user's other machines. */
const ASSOCIATIONS = [MATERIAL_FILES, MATERIAL_FOLDERS, VSICONS_FILES, VSICONS_FOLDERS];
/* Settings Sync writes settings one after another; the icons are kept current once they have all arrived. */
const SETTLE_MS = 1_500;

/** Courier's icons, registered: what removes the commands, and when the passes the start runs are done. */
export interface FileIconsRegistration extends vscode.Disposable {
  /**
   * Settles once the passes the extension runs as it starts — the answers
   * given before kept, the icons kept current, the icon theme in use
   * followed — have run. Never rejects.
   */
  readonly ready: Promise<void>;
  /**
   * Settles once every change to the icons asked for so far — as the
   * extension started, by a command, for a theme picked or settings synced —
   * has been made, the ones asked for meanwhile too. Never rejects.
   */
  settled(): Promise<void>;
}

/**
 * Courier's own icons for `courier.config.*`, `courier.mocks.*` and the
 * `.courier` folder in the icon themes that take custom icons — Material
 * Icon Theme and vscode-icons, each in its own style. Installed, the
 * extension puts them into the icon theme in use as it starts, in any
 * workspace, and into each such theme the user picks later, saying so once
 * with the way to take them out. From then on they follow the user's
 * settings: onto every machine Settings Sync brings them to, across
 * updates, and out again everywhere when taken out — by the message, the
 * command, or out of the settings by hand — after which they go back in
 * only by the command.
 *
 * @param context - The extension's context: where its icons are, and the profile's state
 * @returns What removes the commands, and when the start's own passes are done
 * @example
 * ```ts
 * context.subscriptions.push(registerFileIcons(context));
 * ```
 */
export function registerFileIcons(context: vscode.ExtensionContext): FileIconsRegistration {
  const icons: CourierIcons = {
    dir: join(context.extensionPath, "media", "icons"),
    profile: profileOf(context.globalState),
  };
  const { inTurn: queue, settled } = changesInTurn();
  const inTheme = inThemeContext();
  /* After each change, the walkthrough hears whether the icons are in the theme in use. */
  const inTurn = (what: string, change: () => Promise<unknown>) =>
    queue(what, async () => {
      try {
        return await change();
      } finally {
        await inTheme.tell();
      }
    });
  const remove = () =>
    inTurn("Courier could not take its file icons out", async () => {
      await setAutomatic(false);
      await removeIcons(icons);
      void vscode.window.showInformationMessage(
        `Courier's icons are out of the file icon themes. "${SHOW_ICONS}" puts them back.`,
      );
    });
  /* The user's yes: into the theme in use, and into each one picked from now on — Seti's users told which take them. */
  const show = () =>
    inTurn("Courier could not put its file icons in", async () => {
      await setAutomatic(true);
      const theme = themeInUse();
      if (!theme) {
        pointToIconThemes();
        return;
      }
      const why = await applyIcons(icons, theme);
      if (why) void vscode.window.showWarningMessage(why);
      else
        void vscode.window.showInformationMessage(
          `Courier's icons are in ${ICON_THEMES[theme].label}. "Courier: Remove Courier's Icons from the File Icon Theme" takes them out.`,
        );
    });
  const keep = () =>
    inTurn("Courier could not keep its file icons current", () => keepIconsCurrent(icons));
  const notice = putInNotice(context.globalState, () => void remove());
  const following: Following = { icons, notice, told: new Set() };
  /* The workspace's own vscode-icons settings may hide them: Courier's entries go there too, when the user says so. */
  const addHere = (keys: Parameters<typeof showHere>[0]) =>
    inTurn("Courier could not add its file icons to this folder's settings", async () => {
      await showHere(keys);
      void vscode.window.showInformationMessage(
        "Courier's icons are in this folder's settings too.",
      );
    });
  /* The theme in use first: the icons it just took are the ones the folder's own settings may hide. */
  const follow = async (): Promise<void> => {
    await inTurn("Courier could not follow the icon theme in use", () =>
      followThemeInUse(following),
    );
    await tellHiddenHere(context.workspaceState, addHere).catch((error: unknown) =>
      logFailure("Courier could not read this folder's settings for its file icons", error),
    );
  };
  /* Taken out of the user's settings — by hand, in another window, or by Settings Sync from another machine — they stay out. */
  let held = themesHoldingIcons();
  const watchTakenOut = () => {
    const now = themesHoldingIcons();
    const lost = [...held].filter((theme) => !now.has(theme));
    held = now;
    if (lost.length > 0)
      void inTurn("Courier could not keep its file icons out", () => keepTakenOut(lost));
  };
  let settling: ReturnType<typeof setTimeout> | undefined;
  const ready = Promise.all([
    inTurn("Courier could not keep the answers given about its file icons before", () =>
      keepEarlierChoice(context.globalState),
    ),
    keep(),
    follow(),
  ]).then(() => undefined);
  const registered = vscode.Disposable.from(
    notice,
    vscode.commands.registerCommand("courier.fileIcons.show", show),
    vscode.commands.registerCommand("courier.fileIcons.remove", remove),
    /* A theme installed or taken out later, and a workspace trusted later, which may name another custom icons folder. */
    vscode.extensions.onDidChange(() => {
      void keep();
      void follow();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void keep()),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (
        change.affectsConfiguration("workbench.iconTheme") ||
        change.affectsConfiguration(AUTOMATIC)
      )
        void follow();
      if (!ASSOCIATIONS.some((key) => change.affectsConfiguration(key))) return;
      watchTakenOut();
      clearTimeout(settling);
      settling = setTimeout(() => void keep(), SETTLE_MS);
    }),
    { dispose: () => clearTimeout(settling) },
  );
  return Object.assign(registered, { ready, settled });
}
