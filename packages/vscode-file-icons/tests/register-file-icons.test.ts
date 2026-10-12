/**
 * Courier's file icons offered and shown: offered once per icon theme —
 * when it is the theme in use, it takes Courier's icons, and the workspace
 * has a Courier project, as the editor starts, when a project turns up or
 * when the user picks the theme later — never once declined; shown in the
 * theme in use by the command, and taken out of every theme they were put
 * into.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type * as vscode from "vscode";

import { registerFileIcons } from "../src/register-file-icons";
import {
  asked,
  configurationListeners,
  configWatchers,
  executed,
  extensionListeners,
  installed,
  logged,
  registered,
  settings,
  shown,
  Uri,
  workspaceConfigs,
} from "./vscode-stand-in";

let custom: string;
let state: Map<string, unknown>;
let context: vscode.ExtensionContext;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-offer-"));
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
  workspaceConfigs.splice(0, Infinity, join(root, "shop", "courier.config.ts"));
  state = new Map();
  context = {
    extensionPath: root,
    globalStorageUri: Uri.file(join(root, "storage")),
    globalState: {
      get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
      update: async (key: string, value: unknown) => void state.set(key, value),
    },
    workspaceState: {
      get: (_key: string, fallback?: unknown) => fallback,
      update: async () => undefined,
    },
  } as unknown as vscode.ExtensionContext;
});

afterEach(() => {
  installed.clear();
  configurationListeners.clear();
  configWatchers.dispose();
  extensionListeners.dispose();
  logged.length = 0;
  settings.clear();
  shown.infos.length = 0;
  asked.buttons.length = 0;
  executed.length = 0;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("the offer of Courier's file icons", () => {
  it("is made once for the theme in use, in a Courier project, and runs the command on a yes", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    asked.buttons.push("Show Icons");
    registerFileIcons(context);

    await settle();
    configWatchers.fire();
    await settle();

    expect(shown.infos).toEqual([
      "Show Courier's own icons for courier.config.ts, courier.mocks.ts and .courier in vscode-icons?",
    ]);
    expect(executed).toContainEqual(["courier.fileIcons.show", "vsicons"]);
  });

  it("is made when the user picks a theme that takes Courier's icons later", async () => {
    settings.set("workbench.iconTheme", "vs-seti");
    registerFileIcons(context);
    await settle();

    settings.set("workbench.iconTheme", "material-icon-theme");
    for (const listener of configurationListeners)
      listener({ affectsConfiguration: (key) => key === "workbench.iconTheme" });
    await settle();

    expect(shown.infos).toEqual([
      "Show Courier's own icons for courier.config.ts, courier.mocks.ts and .courier in Material Icon Theme?",
    ]);
  });

  it("is made when a Courier project turns up in the workspace", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    workspaceConfigs.length = 0;
    registerFileIcons(context);
    await settle();
    const before = [...shown.infos];

    workspaceConfigs.push(join(custom, "..", "shop", "courier.config.ts"));
    configWatchers.fire();
    await settle();

    expect(before).toEqual([]);
    expect(shown.infos).toHaveLength(1);
  });

  it("is not made for a theme in use that does not run here, which the log says once", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    installed.delete("vscode-icons-team.vscode-icons");
    registerFileIcons(context);
    await settle();
    configWatchers.fire();
    await settle();

    expect(shown.infos).toEqual([]);
    expect(logged).toEqual([["info", "vscode-icons is not installed."]]);
  });

  it("is not made for a theme that takes no icons, outside a Courier project, or when the settings say no", async () => {
    settings.set("workbench.iconTheme", "vs-seti");
    registerFileIcons(context);
    await settle();
    settings.set("workbench.iconTheme", "material-icon-theme");
    workspaceConfigs.length = 0;
    configWatchers.fire();
    await settle();
    workspaceConfigs.push(join(custom, "..", "shop", "courier.config.ts"));
    settings.set("courier.fileIcons.offer", false);
    configWatchers.fire();
    await settle();

    expect(shown.infos).toEqual([]);
  });
});

describe("the file icon commands", () => {
  it("show the icons in the theme in use, and take them out of every theme they are in", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("courier.fileIcons.offer", false);
    registerFileIcons(context);

    await registered.get("courier.fileIcons.show")?.();
    const entries = settings.get("vsicons.associations.files");
    await registered.get("courier.fileIcons.remove")?.();

    expect(entries).toHaveLength(2);
    expect(shown.infos).toEqual([
      expect.stringContaining("Courier's icons are in vscode-icons."),
      "Courier's icons are out of the file icon themes.",
    ]);
    expect(settings.has("vsicons.associations.files")).toBe(false);
  });
});

describe("Courier's icons, once agreed to", () => {
  it("go into the other theme when the user picks it, in its own style, without asking again", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("material-icon-theme.files.associations", {
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
    });
    registerFileIcons(context);

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(shown.infos).toEqual([]);
    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(existsSync(join(custom, "folder_type_courier.svg"))).toBe(true);
  });

  it("go into a theme installed later, once it runs here", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("material-icon-theme.files.associations", {
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
    });
    const vsicons = installed.get("vscode-icons-team.vscode-icons");
    installed.delete("vscode-icons-team.vscode-icons");
    registerFileIcons(context);
    await settle();
    const before = settings.has("vsicons.associations.files");

    if (vsicons) installed.set("vscode-icons-team.vscode-icons", vsicons);
    extensionListeners.fire();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(before).toBe(false);
    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(shown.infos).toEqual([]);
  });

  it("are not offered again where Settings Sync brought them from another machine", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"] },
    ]);
    registerFileIcons(context);

    await settle();

    expect(shown.infos).toEqual([]);
  });

  it("are copied once the settings Settings Sync brings have settled", async () => {
    registerFileIcons(context);
    await settle();
    settings.set("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"] },
    ]);

    for (const listener of configurationListeners) {
      listener({ affectsConfiguration: (key) => key === "vsicons.associations.files" });
    }
    const early = existsSync(join(custom, "file_type_courier-config.svg"));
    await new Promise((resolve) => setTimeout(resolve, 1_800));

    expect(early).toBe(false);
    expect(existsSync(join(custom, "file_type_courier-config.svg"))).toBe(true);
  });
});
