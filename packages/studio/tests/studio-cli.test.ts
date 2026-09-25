/**
 * The `courier-studio` command, run as a user runs it.
 *
 * `--version` printed the usage and "No version specified"; a port written as
 * `3001abc` was read as 3001; a mistyped `--cwd` crashed with a raw ENOENT
 * stack; and `courier-studio init` ran its own work and then started the whole
 * server anyway. A config that awaits something that never comes must not
 * keep Studio from listening, nor end it in silence.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("the probe server has no port");
  return address.port;
}

async function healthy(port: number, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    if (await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok, () => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
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

  it("listens where its flags say when courier.config never finishes loading", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "courier-studio-cli-"));
    writeFileSync(join(cwd, "courier.config.ts"), "await new Promise(() => {})\nexport default { sources: {} }\n");
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", TSX, CLI, "--port", String(port), "--host", "127.0.0.1"], {
      cwd,
      env: { ...process.env, NO_COLOR: "1", COURIER_CONFIG_LOAD_TIMEOUT_MS: "500" },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));

    const listening = await Promise.race([healthy(port, 15_000), exited.then(() => false)]);
    child.kill("SIGTERM");
    await exited;
    rmSync(cwd, { recursive: true, force: true });

    expect(listening).toBe(true);
    expect(output).toContain("courier.config took longer than 500 ms to load");
  }, 30_000);
});
