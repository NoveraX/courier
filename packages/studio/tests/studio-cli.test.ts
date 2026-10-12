/**
 * The `courier-studio` command, run as a user runs it.
 *
 * `--version` prints its version and `--help` its options, as plain text
 * into a pipe; a port written as `3001abc` is refused, not read as 3001; a
 * mistyped `--cwd` is named, without a stack; and a command it does not
 * have is refused instead of starting the server. It listens where
 * courier.config's `studio` block says, evaluating the config once as it
 * starts. A config that awaits something that never comes does not keep
 * Studio from listening, nor end it in silence.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import manifest from "../package.json" with { type: "json" };

const CLI = join(__dirname, "../src/cli.ts");
/* The server runs the UI's own modules, imported as `@/...`; run from another directory, tsx finds that path in Studio's tsconfig only when told where it is. */
const ENV = {
  ...process.env,
  NO_COLOR: "1",
  TSX_TSCONFIG_PATH: join(__dirname, "../tsconfig.json"),
};
/* What the banner says of a first load given up after COURIER_CONFIG_LOAD_TIMEOUT_MS=500. */
const GIVEN_UP = "took longer than 500 ms, so Studio stopped waiting for it";
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function run(...args: string[]) {
  return spawnSync(process.execPath, ["--import", TSX, CLI, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    env: ENV,
  });
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (address === null || typeof address === "string")
    throw new Error("the probe server has no port");
  return address.port;
}

async function printed(output: () => string, text: string, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    if (output().includes(text)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return output().includes(text);
}

async function healthy(port: number, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    if (
      await fetch(`http://127.0.0.1:${port}/api/health`).then(
        (r) => r.ok,
        () => false,
      )
    )
      return true;
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
    expect(output).toContain(`${resolve("/definitely/not/a/project")} is not a directory`);
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

  it("prints its help as plain text into a pipe, each option with the value it takes", () => {
    /* Neither NO_COLOR nor the TEST and CI a test runner sets: a pipe alone
       must keep colour out. A variable set to undefined is not passed on. */
    const env = {
      ...process.env,
      NO_COLOR: undefined,
      FORCE_COLOR: undefined,
      TEST: undefined,
      CI: undefined,
    };
    const result = spawnSync(process.execPath, ["--import", TSX, CLI, "--help"], {
      encoding: "utf8",
      timeout: 20_000,
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("\x1b[");
    expect(result.stdout).toContain(`Courier Studio v${manifest.version}`);
    expect(result.stdout).toMatch(/--cwd <dir> +Project root directory/);
    expect(result.stdout).toMatch(/--open +Open a browser on start/);
  });

  /* Windows cannot send a process a signal it can handle: `kill` ends it at once. */
  it.skipIf(process.platform === "win32")(
    "closes and reports the signal that ended it",
    async () => {
      const cwd = mkdtempSync(join(tmpdir(), "courier-studio-cli-"));
      const probe = createServer();
      await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
      const { port } = probe.address() as { port: number };
      await new Promise<void>((resolve) => probe.close(() => resolve()));
      const child = spawn(
        process.execPath,
        ["--import", TSX, CLI, "--port", String(port), "--host", "127.0.0.1"],
        {
          cwd,
          env: ENV,
        },
      );
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (
          await fetch(`http://127.0.0.1:${port}/api/health`).then(
            (r) => r.ok,
            () => false,
          )
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      child.kill("SIGTERM");
      const status = await new Promise<number | null>((resolve) =>
        child.once("exit", (code) => resolve(code)),
      );
      rmSync(cwd, { recursive: true, force: true });

      expect(status).toBe(143);
    },
    30_000,
  );

  it("listens where its flags say when courier.config never finishes loading", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "courier-studio-cli-"));
    writeFileSync(
      join(cwd, "courier.config.ts"),
      "await new Promise(() => {})\nexport default { sources: {} }\n",
    );
    const port = await freePort();
    const child = spawn(
      process.execPath,
      ["--import", TSX, CLI, "--port", String(port), "--host", "127.0.0.1"],
      {
        cwd,
        env: { ...ENV, COURIER_CONFIG_LOAD_TIMEOUT_MS: "500" },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );

    const listening = await Promise.race([healthy(port, 15_000), exited.then(() => false)]);
    const told = await printed(() => output, GIVEN_UP, 10_000);
    child.kill("SIGTERM");
    await exited;
    rmSync(cwd, { recursive: true, force: true });

    expect(listening).toBe(true);
    expect(told).toBe(true);
  }, 30_000);

  it("listens where courier.config's studio block says, and evaluates the config once", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "courier-studio-cli-"));
    const port = await freePort();
    writeFileSync(
      join(cwd, "courier.config.ts"),
      'import { appendFileSync } from "node:fs";\n' +
        'import { join } from "node:path";\n' +
        'appendFileSync(join(process.cwd(), "evaluations.log"), "evaluated\\n");\n' +
        `export default { sources: {}, studio: { host: "127.0.0.1", port: ${port} } };\n`,
    );
    const child = spawn(process.execPath, ["--import", TSX, CLI], {
      cwd,
      env: ENV,
    });
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );

    const listening = await Promise.race([healthy(port, 15_000), exited.then(() => false)]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const log = join(cwd, "evaluations.log");
    const evaluations = existsSync(log)
      ? readFileSync(log, "utf8").split("\n").filter(Boolean)
      : [];
    child.kill("SIGTERM");
    await exited;
    rmSync(cwd, { recursive: true, force: true });

    expect(listening).toBe(true);
    expect(evaluations).toEqual(["evaluated"]);
  }, 30_000);

  it("waits for a config that never finishes loading when no flag pins the address, then listens once it is given up", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "courier-studio-cli-"));
    writeFileSync(
      join(cwd, "courier.config.ts"),
      "await new Promise(() => {})\nexport default { sources: {} }\n",
    );
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", TSX, CLI, "--port", String(port)], {
      cwd,
      env: { ...ENV, COURIER_CONFIG_LOAD_TIMEOUT_MS: "500" },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );

    const listening = await Promise.race([healthy(port, 15_000), exited.then(() => false)]);
    child.kill("SIGTERM");
    await exited;
    rmSync(cwd, { recursive: true, force: true });

    expect(listening).toBe(true);
    expect(output).toContain(GIVEN_UP);
  }, 30_000);
});
