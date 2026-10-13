/**
 * The changes to Courier's icons, made one at a time: each once the one
 * asked for before it is made, a failed one logged and the next still made,
 * and settled only once every change asked for is made.
 */
import { afterEach, describe, expect, it } from "vitest";

import { changesInTurn } from "../src/changes-in-turn";
import { logged } from "./vscode-stand-in";

afterEach(() => {
  logged.length = 0;
});

describe("the changes to the icons", () => {
  it("are made one at a time, in the order they were asked for", async () => {
    const { inTurn, settled } = changesInTurn();
    const made: string[] = [];
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    void inTurn("first", async () => {
      await held;
      made.push("first");
    });
    void inTurn("second", async () => {
      made.push("second");
    });
    await Promise.resolve();
    const whileHeld = [...made];
    release();
    await settled();

    expect(whileHeld).toEqual([]);
    expect(made).toEqual(["first", "second"]);
  });

  it("log a change that fails, and still make the next", async () => {
    const { inTurn, settled } = changesInTurn();
    const made: string[] = [];

    void inTurn("Courier could not put its file icons in", async () => {
      throw new Error("disk full");
    });
    void inTurn("Courier could not keep its file icons current", async () => {
      made.push("next");
    });
    await settled();

    expect(made).toEqual(["next"]);
    expect(logged).toContainEqual(["warn", "Courier could not put its file icons in: disk full"]);
  });

  it("are settled only once the changes asked for meanwhile are made too", async () => {
    const { inTurn, settled } = changesInTurn();
    const made: string[] = [];

    void inTurn("first", async () => {
      made.push("first");
      void inTurn("asked meanwhile", async () => {
        made.push("asked meanwhile");
      });
    });
    await settled();

    expect(made).toEqual(["first", "asked meanwhile"]);
  });
});
