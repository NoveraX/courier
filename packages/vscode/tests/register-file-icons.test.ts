/**
 * Courier's file icons offered and shown: offered once per icon theme —
 * when it is the theme in use, it takes Courier's icons, and the workspace
 * has a Courier project, as Courier starts or when the user picks the
 * theme later — never once declined; shown in the theme in use by the
 * command, and taken out of every theme they were put into.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CourierCore } from "../src/core/courier-core";
import { registerFileIcons } from "../src/icons/register-file-icons";
import {
  asked,
  configurationListeners,
  executed,
  registered,
  settings,
  shown,
  workspace,
} from "./vscode-stand-in";

let restarted: () => unknown;
let projects: unknown[];
let state: Map<string, unknown>;
let core: CourierCore;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "courier-offer-"));
  const icons = join(root, "media", "icons");
  mkdirSync(icons, { recursive: true });
  for (const name of ["courier-config", "courier-mocks", "folder-courier", "folder-courier-open"]) {
    writeFileSync(join(icons, `${name}.svg`), "<svg/>");
  }
  settings.set("vsicons.customIconFolderPath", join(root, "custom"));
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
  it("show the icons in the theme in use, and take them out of every theme they went into", async () => {
    settings.set("workbench.iconTheme", "vscode-icons");
    registerFileIcons(core);

    await registered.get("courier.fileIcons.show")?.();
    const applied = state.get("courier.fileIcons.themes");
    const entries = settings.get("vsicons.associations.files");
    await registered.get("courier.fileIcons.remove")?.();

    expect(applied).toEqual(["vsicons"]);
    expect(entries).toHaveLength(2);
    expect(shown.infos.at(0)).toContain("Courier's icons are in vscode-icons.");
    expect(settings.has("vsicons.associations.files")).toBe(false);
    expect(state.get("courier.fileIcons.themes")).toEqual([]);
  });
});
