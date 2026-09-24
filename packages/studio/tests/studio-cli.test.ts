/**
 * The `courier-studio` command, run as a user runs it.
 *
 * A mistyped `--cwd` crashed with a raw ENOENT stack, and `courier-studio
 * init` ran its own work and then started the whole server anyway.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CLI = join(__dirname, "../src/cli.ts");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function run(...args: string[]) {
  return spawnSync(process.execPath, ["--import", TSX, CLI, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("courier-studio", () => {
  it("names a project root that does not exist, without a stack", () => {
    const result = run("--cwd", "/definitely/not/a/project");

    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("/definitely/not/a/project is not a directory");
    expect(output).not.toContain("    at ");
  });

  it("refuses a command it does not have instead of starting the server", () => {
    const result = run("init");

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('Unknown command "init"');
  });

});
