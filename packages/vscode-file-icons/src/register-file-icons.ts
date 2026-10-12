import { join } from "node:path";
import * as vscode from "vscode";

import { applyIcons, hasCourierIcons, keepIconsCurrent, removeIcons } from "./apply-icons";
import { type CourierWorkspace, watchCourierWorkspace } from "./courier-workspace";
import { type CourierIcons, ICON_THEME_IDS, ICON_THEMES, type IconTheme } from "./icon-files";
import { iconsLog, logFailure } from "./icons-log";
import { MATERIAL_FILES, MATERIAL_FOLDERS } from "./material-icons";
import { notHere } from "./theme-reach";
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
 * — as the editor starts, when a Courier project turns up, or when the
 * user picks such a theme later — or the command. From then on the icons
 * follow the user by themselves: into the other theme when the user picks
 * it, onto every machine Settings Sync brings the settings to, across
 * updates, and out again everywhere when taken out.
 *
 * @param context - The extension's context: where its icons are, and the profile's state
 * @returns What removes the commands
 * @example
 * ```ts
 * context.subscriptions.push(registerFileIcons(context));
 * ```
 */
export function registerFileIcons(context: vscode.ExtensionContext): vscode.Disposable {
  const icons: CourierIcons = {
    dir: join(context.extensionPath, "media", "icons"),
    profile: context.globalStorageUri.toString(),
  };
  const workspace = watchCourierWorkspace();
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
      const why = await applyIcons(icons, theme);
      if (why) void vscode.window.showWarningMessage(why);
      else
        void vscode.window.showInformationMessage(
          `Courier's icons are in ${ICON_THEMES[theme].label}. "Courier: Remove Courier's Icons from the File Icon Theme" takes them out.`,
        );
    });
  };
  const remove = () =>
    inTurn("Courier could not take its file icons out", async () => {
      await removeIcons(icons);
      void vscode.window.showInformationMessage("Courier's icons are out of the file icon themes.");
    });
  const keep = () =>
    inTurn("Courier could not keep its file icons current", () => keepIconsCurrent(icons));
  /* Agreed to in one theme, the icons go into the one picked next, in its own style, without asking again. */
  const carry = (theme: IconTheme) =>
    inTurn("Courier could not put its file icons in", async () => {
      const why = await applyIcons(icons, theme);
      iconsLog().info(
        why ?? `Courier's icons went into ${ICON_THEMES[theme].label}, the icon theme in use`,
      );
    });
  const following: Following = { state: context.globalState, workspace, carry, told: new Set() };
  const follow = () => void followThemeInUse(following);
  let settling: ReturnType<typeof setTimeout> | undefined;
  void keep();
  follow();
  return vscode.Disposable.from(
    workspace,
    vscode.commands.registerCommand("courier.fileIcons.show", show),
    vscode.commands.registerCommand("courier.fileIcons.remove", remove),
    workspace.onDidChange(follow),
    /* A theme installed or taken out later, and a workspace trusted later, which may name another custom icons folder. */
    vscode.extensions.onDidChange(() => {
      void keep();
      follow();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void keep()),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("workbench.iconTheme")) follow();
      if (!ASSOCIATIONS.some((key) => change.affectsConfiguration(key))) return;
      clearTimeout(settling);
      settling = setTimeout(() => void keep(), SETTLE_MS);
    }),
    { dispose: () => clearTimeout(settling) },
  );
}

/* What following the theme in use needs: the profile's state, the workspace, how to carry the icons over, the themes said not to run here. */
interface Following {
  readonly state: vscode.Memento;
  readonly workspace: CourierWorkspace;
  readonly carry: (theme: IconTheme) => Promise<unknown>;
  readonly told: Set<IconTheme>;
}

/*
 * The icons for the theme in use: in already, nothing to do; running elsewhere than here, said once in the log;
 * agreed to in the other theme, carried over; agreed to nowhere, offered — once per theme.
 */
async function followThemeInUse({ state, workspace, carry, told }: Following): Promise<void> {
  const theme = themeInUse();
  if (!theme || hasCourierIcons(theme)) return;
  if (!vscode.extensions.getExtension(ICON_THEMES[theme].extension)) {
    if (!told.has(theme)) iconsLog().info(notHere(theme));
    told.add(theme);
    return;
  }
  if (ICON_THEME_IDS.some((other) => hasCourierIcons(other))) {
    await carry(theme);
    return;
  }
  const offered = state.get<IconTheme[]>(OFFERED, []);
  if (offered.includes(theme)) return;
  if (!vscode.workspace.getConfiguration("courier").get<boolean>("fileIcons.offer", true)) return;
  if (!(await workspace.hasProject())) return;
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
