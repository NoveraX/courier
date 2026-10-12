/**
 * A workspace whose own vscode-icons settings hide Courier's icons: the
 * settings that do it found — a list in a workspace's settings takes the
 * place of the user's — the user told once per workspace, and Courier's
 * entries added after the workspace's own when the user says so.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";

import { hiddenHere, showHere, tellHiddenHere } from "../src/hidden-here";
import { VSICONS_PLAN } from "../src/vscode-icons";
import { asked, executed, settings, shown, workspaceSettings } from "./vscode-stand-in";

const FILES = "vsicons.associations.files";
const FOLDERS = "vsicons.associations.folders";
const TEAM = { icon: "team-config", extensions: ["team.config.ts"], format: "svg" };

let state: Map<string, unknown>;
let memento: vscode.Memento;

beforeEach(() => {
  state = new Map();
  memento = {
    get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
    update: async (key: string, value: unknown) => void state.set(key, value),
  } as unknown as vscode.Memento;
  settings.set("workbench.iconTheme", "vscode-icons");
  settings.set(FILES, VSICONS_PLAN.files);
  settings.set(FOLDERS, VSICONS_PLAN.folders);
  workspaceSettings.set(FILES, [TEAM]);
});

afterEach(() => {
  settings.clear();
  workspaceSettings.clear();
  shown.infos.length = 0;
  asked.buttons.length = 0;
  executed.length = 0;
});

describe("Courier's icons hidden by a workspace's own vscode-icons settings", () => {
  it("are found in the settings the workspace holds a list of its own in", () => {
    expect(hiddenHere()).toEqual([FILES]);
  });

  it("are not hidden where the workspace's list holds them, or the user's settings do not", () => {
    workspaceSettings.set(FILES, [TEAM, ...VSICONS_PLAN.files]);
    const listed = hiddenHere();
    workspaceSettings.set(FILES, [TEAM]);
    settings.delete(FILES);

    expect(listed).toEqual([]);
    expect(hiddenHere()).toEqual([]);
  });

  it("go into the workspace's settings after its own, the user's left as they are", async () => {
    await showHere([FILES]);

    expect(workspaceSettings.get(FILES)).toEqual([TEAM, ...VSICONS_PLAN.files]);
    expect(settings.get(FILES)).toEqual(VSICONS_PLAN.files);
  });

  it("are told once per workspace, and added when the user says so", async () => {
    const added: unknown[] = [];
    asked.buttons.push("Add Courier's Icons Here");

    await tellHiddenHere(memento, async (keys) => added.push(keys));
    await tellHiddenHere(memento, async (keys) => added.push(keys));

    expect(shown.infos).toEqual([
      "This folder's settings give vscode-icons associations of their own, which take the place of yours here, so Courier's icons do not show in it.",
    ]);
    expect(added).toEqual([[FILES]]);
  });

  it("open the folder's settings when the user asks, and are not told while another theme is in use", async () => {
    settings.set("workbench.iconTheme", "material-icon-theme");
    await tellHiddenHere(memento, async () => undefined);
    settings.set("workbench.iconTheme", "vscode-icons");
    asked.buttons.push("Open Folder Settings");

    await tellHiddenHere(memento, async () => undefined);

    expect(shown.infos).toHaveLength(1);
    expect(executed).toContainEqual(["workbench.action.openWorkspaceSettingsFile"]);
  });
});
