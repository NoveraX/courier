/**
 * The user's choice whether Courier's icons go in by themselves: read from
 * their own settings alone, and the answers they gave Courier File Icons
 * 0.4 — which asked first — kept as that choice, once.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";

import { automatic, keepEarlierChoice, setAutomatic } from "../src/icons-choice";
import { settings, workspaceSettings } from "./vscode-stand-in";

let state: Map<string, unknown>;
let memento: vscode.Memento;

beforeEach(() => {
  state = new Map();
  memento = {
    keys: () => [...state.keys()],
    get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
    update: async (key: string, value: unknown) => {
      if (value === undefined) state.delete(key);
      else state.set(key, value);
    },
  } as vscode.Memento;
});

afterEach(() => {
  settings.clear();
  workspaceSettings.clear();
});

describe("the choice whether Courier's icons go in by themselves", () => {
  it("is the user's own, never a workspace's", () => {
    const unset = automatic();
    workspaceSettings.set("courier.fileIcons.automatic", false);
    const workspaceOff = automatic();
    settings.set("courier.fileIcons.automatic", false);
    workspaceSettings.set("courier.fileIcons.automatic", true);

    expect([unset, workspaceOff, automatic()]).toEqual([true, true, false]);
  });

  it("turns off by a false in the user's settings, and on by taking it out", async () => {
    await setAutomatic(false);
    const off = settings.get("courier.fileIcons.automatic");
    await setAutomatic(true);

    expect(off).toBe(false);
    expect(settings.has("courier.fileIcons.automatic")).toBe(false);
  });
});

describe("the answers given to Courier File Icons 0.4", () => {
  it("keep the icons out where a theme was offered and holds none: Not Now, or the offer closed", async () => {
    state.set("courier.fileIcons.offered", ["vsicons"]);

    await keepEarlierChoice(memento);

    expect(settings.get("courier.fileIcons.automatic")).toBe(false);
    expect(state.has("courier.fileIcons.offered")).toBe(false);
  });

  it("leave the choice as it is where the icons are in, from a yes", async () => {
    state.set("courier.fileIcons.offered", ["vsicons"]);
    settings.set("material-icon-theme.files.associations", {
      "courier.config.ts": "../../.noverax-courier-icons/courier-config",
    });

    await keepEarlierChoice(memento);

    expect(settings.has("courier.fileIcons.automatic")).toBe(false);
    expect(state.has("courier.fileIcons.offered")).toBe(false);
  });

  it("keep the icons out where the user turned the offer off, the old setting taken away", async () => {
    settings.set("courier.fileIcons.offer", false);

    await keepEarlierChoice(memento);

    expect(settings.get("courier.fileIcons.automatic")).toBe(false);
    expect(settings.has("courier.fileIcons.offer")).toBe(false);
  });

  it("read the user's own settings alone, and leave a workspace's as they are", async () => {
    settings.set("courier.fileIcons.offer", true);
    workspaceSettings.set("courier.fileIcons.offer", false);

    await keepEarlierChoice(memento);

    expect(settings.has("courier.fileIcons.automatic")).toBe(false);
    expect(settings.has("courier.fileIcons.offer")).toBe(false);
    expect(workspaceSettings.get("courier.fileIcons.offer")).toBe(false);
  });

  it("change nothing where none were given", async () => {
    await keepEarlierChoice(memento);

    expect([...settings.keys()]).toEqual([]);
    expect([...state.keys()]).toEqual([]);
  });
});
