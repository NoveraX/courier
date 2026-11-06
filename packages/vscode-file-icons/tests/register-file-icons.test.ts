/**
 * Courier's file icons put in and taken out: into the icon theme in use as
 * the extension starts — in any workspace, with no question first — when
 * the theme takes Courier's icons and runs here, said once with the way to
 * take them out; carried into the theme the user picks next; never again by
 * themselves once taken out — by the message, the command, or out of the
 * settings by hand or by Settings Sync — until the command shows them.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type * as vscode from "vscode";

import { type FileIconsRegistration, registerFileIcons } from "../src/register-file-icons";
import {
  asked,
  configurationListeners,
  executed,
  extensionListeners,
  installed,
  logged,
  registered,
  settingChanged,
  settings,
  shown,
  Uri,
  windowState,
  windowStates,
  workspaceSettings,
} from "./vscode-stand-in";

const PUT_IN = "Courier's own icons for courier.config.ts, courier.mocks.ts and .courier are in";

let custom: string;
let state: Map<string, unknown>;
let context: vscode.ExtensionContext;
/* The registrations a test made: a pass still running when it ends would write into the next test's folders through the settings they share. */
const registrations: FileIconsRegistration[] = [];

function register(extension: vscode.ExtensionContext): FileIconsRegistration {
  const registration = registerFileIcons(extension);
  registrations.push(registration);
  return registration;
}

/* Start the extension, and wait for every change its start asked for — a button pressed on its message too. */
async function started(): Promise<FileIconsRegistration> {
  const registration = register(context);
  await registration.ready;
  await registration.settled();
  return registration;
}

/* The settings changed as another hand changes them: the user in their settings file, or Settings Sync. */
function changeSettings(key: string, value: unknown): void {
  if (value === undefined) settings.delete(key);
  else settings.set(key, value);
  settingChanged(key);
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-icons-start-"));
  const icons = join(root, "media", "icons");
  mkdirSync(icons, { recursive: true });
  for (const name of [
    "courier-config",
    "courier-mocks",
    "folder-courier",
    "folder-courier-open",
    "folder-courier-vsicons",
    "folder-courier-vsicons-open",
    "folder-courier-vsicons-light",
    "folder-courier-vsicons-light-open",
  ]) {
    writeFileSync(join(icons, `${name}.svg`), "<svg/>");
  }
  installed.set("vscode-icons-team.vscode-icons", {
    extensionPath: join(root, "vsicons"),
    isActive: true,
  });
  installed.set("PKief.material-icon-theme", {
    extensionPath: join(root, "extensions", "pkief.material-icon-theme-5.39.0"),
  });
  settings.set("vsicons.customIconFolderPath", join(root, "custom"));
  custom = join(root, "custom", "vsicons-custom-icons");
  state = new Map();
  context = {
    extensionPath: root,
    globalStorageUri: Uri.file(join(root, "storage")),
    globalState: {
      get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
      update: async (key: string, value: unknown) => {
        if (value === undefined) state.delete(key);
        else state.set(key, value);
      },
    },
    workspaceState: {
      get: (_key: string, fallback?: unknown) => fallback,
      update: async () => undefined,
    },
  } as unknown as vscode.ExtensionContext;
});

afterEach(async () => {
  for (const registration of registrations.splice(0)) {
    await registration.ready;
    await registration.settled();
    registration.dispose();
  }
  installed.clear();
  configurationListeners.clear();
  extensionListeners.dispose();
  windowStates.dispose();
  windowState.focused = true;
  logged.length = 0;
  settings.clear();
  workspaceSettings.clear();
  shown.infos.length = 0;
  shown.buttons.length = 0;
  asked.buttons.length = 0;
  executed.length = 0;
});

describe("Courier's icons as the extension starts", () => {
  it("go into the theme in use in any workspace, no question first, and say so once with the way out", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");

    await started();

    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(existsSync(join(custom, "folder_type_courier.svg"))).toBe(true);
    expect(shown.infos).toEqual([`${PUT_IN} vscode-icons now.`]);
    expect(shown.buttons).toEqual([["Take Them Out"]]);
    expect(settings.get("workbench.iconTheme")).toBe("vscode-icons");
  });

  it("come out for good on the message's button", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    asked.buttons.push("Take Them Out");
    await started();
    const out = {
      files: settings.has("vsicons.associations.files"),
      copy: existsSync(join(custom, "folder_type_courier.svg")),
    };
    shown.infos.length = 0;

    await started();

    expect(out).toEqual({ files: false, copy: false });
    expect(settings.get("courier.fileIcons.automatic")).toBe(false);
    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(shown.infos).toEqual([]);
  });

  it("go into a theme that takes them when the user picks it later, said once", async () => {
    settings.set("workbench.iconTheme", "vs-seti");
    const registration = await started();

    changeSettings("workbench.iconTheme", "material-icon-theme");
    await registration.settled();

    expect(settings.get("material-icon-theme.files.associations")).toMatchObject({
      "courier.config.ts": expect.stringContaining("courier-config"),
    });
    expect(shown.infos).toEqual([`${PUT_IN} Material Icon Theme now.`]);
  });

  it("go in where none are only as the user's own settings let them, never a workspace's", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("courier.fileIcons.automatic", false);
    workspaceSettings.set("courier.fileIcons.automatic", true);

    await started();

    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(shown.infos).toEqual([]);
    expect(logged).toEqual([
      [
        "info",
        `Courier's icons are not in vscode-icons, the icon theme in use, and go in only by "Courier: Show Courier's Icons in the File Icon Theme": courier.fileIcons.automatic is off.`,
      ],
    ]);
  });

  it("stay out after an earlier no to the question Courier File Icons once asked", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    state.set("courier.fileIcons.offered", ["vsicons"]);

    await started();

    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(settings.get("courier.fileIcons.automatic")).toBe(false);
    expect(state.has("courier.fileIcons.offered")).toBe(false);
    expect(shown.infos).toEqual([]);
  });

  it("are not put into a theme in use that does not run here, which the log says once", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    installed.delete("vscode-icons-team.vscode-icons");
    const registration = await started();

    extensionListeners.fire();
    await registration.settled();

    expect(shown.infos).toEqual([]);
    expect(logged).toEqual([["info", "vscode-icons is not installed."]]);
  });

  it("are not put into a theme that takes no icons, and the log says once which ones take them", async () => {
    settings.set("workbench.iconTheme", "vs-seti");
    const registration = await started();

    extensionListeners.fire();
    await registration.settled();

    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(settings.has("material-icon-theme.files.associations")).toBe(false);
    expect(shown.infos).toEqual([]);
    expect(logged).toEqual([
      [
        "info",
        "The icon theme in use takes no custom icons: Courier's icons show in Material Icon Theme and vscode-icons.",
      ],
    ]);
  });

  it("tell the walkthrough whether they are in the icon theme in use", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    await started();
    const before = executed.filter(([name]) => name === "setContext");

    await registered.get("courier.fileIcons.remove")?.();

    expect(before).toEqual([["setContext", "courier.fileIconsInTheme", true]]);
    expect(executed.filter(([name]) => name === "setContext")).toEqual([
      ["setContext", "courier.fileIconsInTheme", true],
      ["setContext", "courier.fileIconsInTheme", false],
    ]);
  });
});

describe("the message that Courier's icons went in", () => {
  it("waits for the user to come to the window", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    windowState.focused = false;
    await started();
    const before = [...shown.infos];

    windowState.focused = true;
    windowStates.fire({ focused: true });

    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(before).toEqual([]);
    expect(shown.infos).toEqual([`${PUT_IN} vscode-icons now.`]);
  });
});

describe("Courier's icons, once in", () => {
  it("go into the other theme when the user picks it, in its own style, without a word", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("material-icon-theme.files.associations", {
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
    });

    await started();

    expect(shown.infos).toEqual([]);
    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(existsSync(join(custom, "folder_type_courier.svg"))).toBe(true);
    expect(logged).toContainEqual([
      "info",
      "Courier's icons went into vscode-icons, the icon theme in use",
    ]);
  });

  it("go into a theme installed later, once it runs here", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("material-icon-theme.files.associations", {
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
    });
    const vsicons = installed.get("vscode-icons-team.vscode-icons");
    installed.delete("vscode-icons-team.vscode-icons");
    const registration = await started();
    const before = settings.has("vsicons.associations.files");

    if (vsicons) installed.set("vscode-icons-team.vscode-icons", vsicons);
    extensionListeners.fire();
    await registration.settled();

    expect(before).toBe(false);
    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(shown.infos).toEqual([]);
  });

  it("are not put in again where Settings Sync brought them from another machine", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"] },
    ]);

    await started();

    expect(shown.infos).toEqual([]);
  });

  it("are copied once the settings Settings Sync brings have settled", async () => {
    /* The start runs a pass of its own, which reads the settings too: still
       running, it would meet the ones synced below and copy at once. */
    const registration = await started();

    changeSettings("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"] },
    ]);
    const early = existsSync(join(custom, "file_type_courier-config.svg"));
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    await registration.settled();

    expect(early).toBe(false);
    expect(existsSync(join(custom, "file_type_courier-config.svg"))).toBe(true);
  });

  it("stay out once taken out of the settings by hand or by Settings Sync, whichever theme holds them", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    const registration = await started();
    shown.infos.length = 0;

    changeSettings("vsicons.associations.files", undefined);
    changeSettings("vsicons.associations.folders", undefined);
    await registration.settled();
    changeSettings("workbench.iconTheme", "material-icon-theme");
    await registration.settled();
    await started();

    expect(settings.get("courier.fileIcons.automatic")).toBe(false);
    expect(settings.has("material-icon-theme.files.associations")).toBe(false);
    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(shown.infos).toEqual([]);
  });
});

describe("the file icon commands", () => {
  it("take the icons out of every theme, for good, and show them again in the theme in use", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    const registration = await started();
    shown.infos.length = 0;

    await registered.get("courier.fileIcons.remove")?.();
    const out = {
      files: settings.has("vsicons.associations.files"),
      automatic: settings.get("courier.fileIcons.automatic"),
    };
    await registered.get("courier.fileIcons.show")?.();
    await registration.settled();

    expect(out).toEqual({ files: false, automatic: false });
    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(settings.has("courier.fileIcons.automatic")).toBe(false);
    expect(shown.infos).toEqual([
      `Courier's icons are out of the file icon themes. "Courier: Show Courier's Icons in the File Icon Theme" puts them back.`,
      `Courier's icons are in vscode-icons. "Courier: Remove Courier's Icons from the File Icon Theme" takes them out.`,
    ]);
  });

  it("point to the icon themes that take them, in the editor's own picker, when the one in use takes none", async () => {
    settings.set("workbench.iconTheme", "vs-seti");
    settings.set("courier.fileIcons.automatic", false);
    const registration = await started();
    asked.buttons.push("Choose a File Icon Theme");

    await registered.get("courier.fileIcons.show")?.();
    await registration.settled();

    expect(shown.infos).toEqual([
      "The icon theme in use takes no custom icons. Courier's icons show in Material Icon Theme and vscode-icons: choose one of them, and they go in.",
    ]);
    expect(shown.buttons).toEqual([["Choose a File Icon Theme"]]);
    expect(executed).toContainEqual(["workbench.action.selectIconTheme"]);
    expect(settings.has("courier.fileIcons.automatic")).toBe(false);
    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(settings.has("material-icon-theme.files.associations")).toBe(false);
  });

  it("are settled once the change a command asked for is made", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("courier.fileIcons.automatic", false);
    const registration = await started();

    void registered.get("courier.fileIcons.show")?.();
    await registration.settled();

    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(existsSync(join(custom, "folder_type_courier.svg"))).toBe(true);
  });
});
