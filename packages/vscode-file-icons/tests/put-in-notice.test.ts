/**
 * The one message that Courier's icons went in by themselves: every window
 * of the profile puts them in together, and the one the user is in says so
 * — now, or once the user comes to it — unless another window already did
 * or the icons are out again by then.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";

import { putInNotice } from "../src/put-in-notice";
import { asked, settings, shown, windowState, windowStates } from "./vscode-stand-in";

const SAID =
  "Courier's own icons for courier.config.ts, courier.mocks.ts and .courier are in vscode-icons now.";

let state: Map<string, unknown>;
let memento: vscode.Memento;
let takenOut: number;

beforeEach(() => {
  state = new Map();
  memento = {
    keys: () => [...state.keys()],
    get: (key: string, fallback?: unknown) => state.get(key) ?? fallback,
    update: async (key: string, value: unknown) => void state.set(key, value),
  } as vscode.Memento;
  takenOut = 0;
  settings.set("vsicons.associations.files", [
    { icon: "courier-config", extensions: ["courier.config.ts"] },
  ]);
});

afterEach(() => {
  settings.clear();
  windowStates.dispose();
  windowState.focused = true;
  shown.infos.length = 0;
  shown.buttons.length = 0;
  asked.buttons.length = 0;
});

function notice(): ReturnType<typeof putInNotice> {
  return putInNotice(memento, () => {
    takenOut += 1;
  });
}

describe("the message that Courier's icons went in", () => {
  it("is said at once in the window the user is in, with the way to take them out", async () => {
    asked.buttons.push("Take Them Out");

    notice().tell("vsicons", Date.now());
    await expect.poll(() => takenOut).toBe(1);

    expect(shown.infos).toEqual([SAID]);
    expect(shown.buttons).toEqual([["Take Them Out"]]);
  });

  it("waits for the user to come to a window they are not in, and is said there once", () => {
    windowState.focused = false;
    const told = notice();

    told.tell("vsicons", Date.now());
    const before = [...shown.infos];
    windowStates.fire({ focused: true });
    windowStates.fire({ focused: false });
    windowStates.fire({ focused: true });

    expect(before).toEqual([]);
    expect(shown.infos).toEqual([SAID]);
  });

  it("is not said again where another window said it since this one put the icons in", () => {
    const decided = Date.now();
    windowState.focused = false;
    const told = notice();
    told.tell("vsicons", decided);

    state.set("courier.fileIcons.toldAt", decided + 1);
    windowStates.fire({ focused: true });

    expect(shown.infos).toEqual([]);
  });

  it("is said for icons that went in after another window said it last", () => {
    state.set("courier.fileIcons.toldAt", Date.now() - 60_000);

    notice().tell("vsicons", Date.now());

    expect(shown.infos).toEqual([SAID]);
  });

  it("is not said once the icons are out again by the time the user comes to the window", () => {
    windowState.focused = false;
    const told = notice();
    told.tell("vsicons", Date.now());

    settings.delete("vsicons.associations.files");
    windowStates.fire({ focused: true });

    expect(shown.infos).toEqual([]);
  });

  it("stops waiting once the extension stops", () => {
    windowState.focused = false;
    const told = notice();
    told.tell("vsicons", Date.now());

    told.dispose();
    windowStates.fire({ focused: true });

    expect(shown.infos).toEqual([]);
  });
});
