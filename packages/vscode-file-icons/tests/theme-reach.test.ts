/**
 * Why an icon theme takes no icons from here: not installed, outside a
 * remote window; in one, run on the remote machine, with what to do.
 */
import { afterEach, describe, expect, it } from "vitest";

import { notHere } from "../src/theme-reach";
import { env } from "./vscode-stand-in";

afterEach(() => {
  env.remoteName = undefined;
});

describe("an icon theme that does not run here", () => {
  it("is not installed, outside a remote window", () => {
    expect(notHere("material")).toBe("Material Icon Theme is not installed.");
  });

  it("runs on the remote machine in a remote window, and is to be installed on this computer too", () => {
    env.remoteName = "dev-container";

    expect(notHere("vsicons")).toBe(
      "vscode-icons does not run on this computer in this remote window, so Courier's icons cannot go into it from here. Install vscode-icons on this computer as well: VS Code then runs it here, beside Courier File Icons, which puts the icons in.",
    );
  });
});
