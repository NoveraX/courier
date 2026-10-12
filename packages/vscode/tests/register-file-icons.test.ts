/**
 * Courier's file icons offered and shown: offered once per icon theme —
 * when it is the theme in use, it takes Courier's icons, and the workspace
 * has a Courier project, as Courier starts or when the user picks the
 * theme later — never once declined; shown in the theme in use by the
 * command, and taken out of every theme they were put into.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CourierCore } from "../src/core/courier-core";
import { registerFileIcons } from "../src/icons/register-file-icons";
import {
  asked,
  configurationListeners,
  executed,
  installed,
  registered,
  settings,
  shown,
  workspace,
} from "./vscode-stand-in";

let restarted: () => unknown;
let custom: string;
let projects: unknown[];
let state: Map<string, unknown>;
let core: CourierCore;

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
  settings.set("vsicons.customIconFolderPath", join(root, "custom"));
  custom = join(root, "custom", "vsicons-custom-icons");
  projects = [{ root: "/work/shop", name: "shop" }];
  state = new Map();
  core = {
    context: {
      extensionPath: root,
      globalState: {
        get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
        update: async (key: string, value: unknown) => void state.set(key, value),
      },
    },
    settings: () => workspace.getConfiguration("courier"),
    projects: { list: async () => projects },
    onRestart: (listener: () => unknown) => {
      restarted = listener;
      return { dispose: () => undefined };
    },
  } as unknown as CourierCore;
});

afterEach(() => {
  installed.clear();
  configurationListeners.clear();
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
    registerFileIcons(core);

    restarted();
    await settle();
    restarted();
    await settle();

    expect(shown.infos).toEqual([
      "Show Courier's own icons for courier.config.ts, courier.mocks.ts and .courier in vscode-icons?",
    ]);
    expect(executed).toContainEqual(["courier.fileIcons.show", "vsicons"]);
  });

  it("is made when the user picks a theme that takes Courier's icons later", async () => {
    settings.set("workbench.iconTheme", "vs-seti");
    registerFileIcons(core);
    restarted();
    await settle();

    settings.set("workbench.iconTheme", "material-icon-theme");
    for (const listener of configurationListeners)
      listener({ affectsConfiguration: (key) => key === "workbench.iconTheme" });
    await settle();

    expect(shown.infos).toEqual([
      "Show Courier's own icons for courier.config.ts, courier.mocks.ts and .courier in Material Icon Theme?",
    ]);
  });

  it("is not made for a theme that takes no icons, outside a Courier project, or when the settings say no", async () => {
    registerFileIcons(core);
    settings.set("workbench.iconTheme", "vs-seti");
    restarted();
    await settle();
    settings.set("workbench.iconTheme", "material-icon-theme");
    projects = [];
    restarted();
    await settle();
    projects = [{ root: "/work/shop", name: "shop" }];
    settings.set("courier.fileIcons.offer", false);
    restarted();
    await settle();

    expect(shown.infos).toEqual([]);
  });
});

describe("the file icon commands", () => {
  it("show the icons in the theme in use, and take them out of every theme they are in", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    registerFileIcons(core);

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
    registerFileIcons(core);

    restarted();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(shown.infos).toEqual([]);
    expect(settings.get("vsicons.associations.files")).toHaveLength(2);
    expect(existsSync(join(custom, "folder_type_courier.svg"))).toBe(true);
  });

  it("are not offered again where Settings Sync brought them from another machine", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    settings.set("vsicons.associations.files", [
      { icon: "courier-config", extensions: ["courier.config.ts"] },
    ]);
    registerFileIcons(core);

    restarted();
    await settle();

    expect(shown.infos).toEqual([]);
  });

  it("are copied once the settings Settings Sync brings have settled", async () => {
    registerFileIcons(core);
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
