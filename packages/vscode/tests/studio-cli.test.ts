/**
 * Courier Studio's commands run in a terminal with each argument whole and
 * never read by a shell — an address with `$(…)`, a backtick, `&`, `%` or a
 * quote in it included: on macOS and Linux as `sh`'s positional arguments,
 * on Windows through `cmd` with every character it reads escaped, never
 * through PowerShell, which runs a `$(…)` even in double quotes. Each runs
 * under its own shell on the system that has it. No line is typed into a
 * shell, so none is kept in its history. Values are made up.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runStudioCommand, studioLaunch } from "../src/generate/studio-cli";
import { terminals } from "./vscode-stand-in";

/* What PowerShell, cmd and a POSIX shell would each read as their own. */
const HOSTILE = 'https://x.example/spec?q=$(calc)&v=`$x`&w=%PATH%&n=\'"1"\'&s=a\\"b c';

let dir: string | undefined;

beforeEach(() => {
  terminals.length = 0;
});

afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("a command of Studio's, on macOS and Linux", () => {
  /* Windows has no sh: there the launch goes through cmd, run below. */
  it.skipIf(process.platform === "win32")(
    "hands sh each argument whole, so nothing in it is expanded or run",
    () => {
      dir = mkdtempSync(join(tmpdir(), "courier-launch-"));
      const ran = join(dir, "ran");
      /* An npx that writes down the arguments it was given, one to a line. */
      writeFileSync(join(dir, "npx"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(dir, "args")}"\n`);
      chmodSync(join(dir, "npx"), 0o755);
      const address = `${HOSTILE}&t=$(touch ${ran})&u=\`touch ${ran}\`&h=$HOME`;

      const { shellPath, shellArgs } = studioLaunch(["import", address], "darwin");
      execFileSync(shellPath, [...shellArgs], {
        env: { PATH: `${dir}:/usr/bin:/bin`, SHELL: "/bin/sh", NODE_ENV: "test" },
        input: "",
      });

      const given = readFileSync(join(dir, "args"), "utf8").split("\n").slice(0, -1);
      expect(given).toEqual(["@noverax/courier-studio", "import", address]);
      expect(existsSync(ran)).toBe(false);
    },
  );
});

describe("a command of Studio's, on Windows", () => {
  it("goes through cmd, never PowerShell, every character cmd reads escaped at both of its readings", () => {
    const { shellPath, shellArgs } = studioLaunch(["import", HOSTILE], "win32");
    const start = '/d /s /k "npx @noverax/courier-studio ';

    expect(shellPath).toBe("cmd.exe");
    expect(typeof shellArgs === "string" && shellArgs.startsWith(start)).toBe(true);
    const words = String(shellArgs).slice(start.length, -1);
    /* cmd reads the line once, then npx's .cmd file reads its %* again: each takes one ^ off. */
    const read = words.replace(/\^(.)/g, "$1").replace(/\^(.)/g, "$1");
    expect(read).toBe(
      '"import" "https://x.example/spec?q=$(calc)&v=' +
        "`$x`" +
        String.raw`&w=%PATH%&n='\"1\"'&s=a\\\"b c"`,
    );
    /* Nothing cmd reads as its own is left bare at either reading, but the space between words. */
    expect(words.replace(/\^\^\^./g, "")).not.toMatch(/[()%!^"`<>&|;,*?]/);
  });

  /* Only Windows has cmd, and npx as a .cmd file. */
  it.runIf(process.platform === "win32")(
    "hands cmd each argument whole, so nothing in it is expanded or run",
    () => {
      dir = mkdtempSync(join(tmpdir(), "courier-launch-"));
      const ran = join(dir, "ran");
      const windows = process.env.SystemRoot ?? "C:\\Windows";
      /*
       * An npx.cmd as npm writes one, whose %* cmd reads once more, and a
       * node that writes down the arguments it was given.
       */
      const record = `require("node:fs").writeFileSync(${JSON.stringify(join(dir, "args.json"))}, JSON.stringify(process.argv.slice(2)));\n`;
      writeFileSync(join(dir, "args.cjs"), record);
      writeFileSync(
        join(dir, "npx.cmd"),
        `@"${process.execPath}" "${join(dir, "args.cjs")}" %*\r\n`,
      );
      /* PowerShell would make the file at $(…); cmd at a bare & or >, or put a value for %…%. */
      const address = `${HOSTILE}&t=$(New-Item '${ran}')&u=1&echo>"${ran}"&h=%COURIER_LAUNCH_PROBE%`;

      const { shellPath, shellArgs } = studioLaunch(["import", address], "win32");
      const run = spawnSync(shellPath, [String(shellArgs)], {
        cwd: dir,
        env: {
          PATH: `${dir};${join(windows, "System32")}`,
          PATHEXT: ".COM;.EXE;.BAT;.CMD",
          SystemRoot: windows,
          COURIER_LAUNCH_PROBE: "made-up",
        },
        input: "",
        encoding: "utf8",
        /* cmd stays once the command ends, until its input does: one that waited fails, not hangs. */
        timeout: 30_000,
        /* The string as VS Code hands it to cmd, with no quotes of Node's around it. */
        windowsVerbatimArguments: true,
      });

      const said = [run.error?.message, run.stdout, run.stderr].filter(Boolean).join("\n");
      expect(existsSync(join(dir, "args.json")), said).toBe(true);
      const given: unknown = JSON.parse(readFileSync(join(dir, "args.json"), "utf8"));
      expect(given).toEqual(["@noverax/courier-studio", "import", address]);
      expect(existsSync(ran)).toBe(false);
    },
  );
});

describe("running a command of Studio's", () => {
  it("opens a terminal of its own that starts it, types nothing into a shell, and is not brought back", () => {
    runStudioCommand({ name: "shop", root: "/work/shop" } as never, "Import API", [
      "import",
      HOSTILE,
    ]);

    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.options).toMatchObject({
      name: "Import API · shop",
      cwd: "/work/shop",
      isTransient: true,
      ...studioLaunch(["import", HOSTILE]),
    });
    expect(terminals[0]?.sent).toEqual([]);
  });
});
