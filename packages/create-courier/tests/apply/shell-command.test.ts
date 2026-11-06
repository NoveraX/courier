import { describe, expect, it } from "vitest";

import { spawnable } from "../../src/apply/shell-command";

describe("spawnable", () => {
  it("spawns every program directly outside Windows", () => {
    expect(spawnable(["npm", "install", "zod@^4"], "linux")).toEqual({
      program: "npm",
      args: ["install", "zod@^4"],
      shell: false,
    });
  });

  it("spawns Node directly on Windows, so the person's text never reaches a shell", () => {
    const node = "C:\\Program Files\\nodejs\\node.exe";

    expect(
      spawnable([node, "cli.js", "import", "https://example.com/spec?a=1&calc"], "win32"),
    ).toEqual({
      program: node,
      args: ["cli.js", "import", "https://example.com/spec?a=1&calc"],
      shell: false,
    });
  });

  it("starts a package manager's shim through the shell on Windows, each argument quoted so a caret is kept", () => {
    expect(spawnable(["npm", "install", "--save-dev", "@noverax/courier@^0.5.0"], "win32")).toEqual(
      {
        program: "npm",
        args: ['"install"', '"--save-dev"', '"@noverax/courier@^0.5.0"'],
        shell: true,
      },
    );
  });

  it.each(["a&calc", "a|b", "a>b", "a<b", "(a)", "%PATH%", "!x!", "a b", 'a"b', ""])(
    "refuses %j as an argument of a shim on Windows",
    (argument) => {
      expect(() => spawnable(["pnpm", "add", argument], "win32")).toThrow(
        "pnpm is started through Windows' command shell, which would read",
      );
    },
  );
});
