/**
 * Courier Studio's commands run in a terminal with each argument whole and
 * never read by a shell — an address with `$(…)`, a backtick, `&`, `%` or a
 * quote in it included: on macOS and Linux as `sh`'s positional arguments,
 * on Windows through `cmd` with every character it reads escaped, never
 * through PowerShell, which runs a `$(…)` even in double quotes. No line is
 * typed into a shell, so none is kept in its history. Values are made up.
 */
import { execFileSync } from "node:child_process";
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
  it("hands sh each argument whole, so nothing in it is expanded or run", () => {
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
  });
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
