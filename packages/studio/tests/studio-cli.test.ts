/**
 * The `courier-studio` command, run as a user runs it.
 *
 * `--version` printed the usage and "No version specified"; a port written as
 * `3001abc` was read as 3001; a mistyped `--cwd` crashed with a raw ENOENT
 * stack; and `courier-studio init` ran its own work and then started the whole
 * server anyway.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import manifest from "../package.json" with { type: "json" };

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
  it("prints its version", () => {
    const result = run("--version");

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(manifest.version);
  });

  it("refuses a port that is not a number", () => {
    const result = run("--port", "3001abc");

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('Invalid --port: "3001abc"');
  });

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

  it("shows no empty defaults in its help", () => {
    const result = run("--help");

    expect(result.stdout).not.toContain("(Default: )");
  });

  it("closes and reports the signal that ended it", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "courier-studio-cli-"));
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const { port } = probe.address() as { port: number };
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const child = spawn(process.execPath, ["--import", TSX, CLI, "--port", String(port), "--host", "127.0.0.1"], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    for (let waited = 0; waited < 15_000; waited += 100) {
      if (await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    child.kill("SIGTERM");
    const status = await new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
    rmSync(cwd, { recursive: true, force: true });

    expect(status).toBe(143);
  }, 30_000);
});
