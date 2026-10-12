/**
 * The server's SIGTERM/SIGINT handling, in a real process receiving a real
 * signal. The server ends the process once drained only when nothing else
 * handles the signal, so an embedding host's own handler finishes its
 * cleanup rather than being cut short.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { setupSignalHandlers } from "../src/signal-handlers";

const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const CREATE_SERVER = pathToFileURL(join(__dirname, "../src/create-server.ts")).href;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** A host program under the repository's node_modules, so it resolves the workspace packages. */
function host(body: string): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-server-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "signals-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "host.mts");
  writeFileSync(
    file,
    [
      `import { createCourierServer } from ${JSON.stringify(CREATE_SERVER)};`,
      body,
      "const server = createCourierServer({ sources: {}, port: 0, host: '127.0.0.1' });",
      "await server.ready;",
      "console.log('ready');",
    ].join("\n"),
  );
  return file;
}

interface Run {
  readonly output: string;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** Start the host, send it `signal` once it is ready, and collect how it ended. */
function signalled(file: string, signal: NodeJS.Signals): Promise<Run> {
  const child: ChildProcess = spawn(process.execPath, ["--import", TSX, file], {
    env: { ...process.env, NO_COLOR: "1" },
  });
  cleanups.push(() => child.kill("SIGKILL"));
  let output = "";
  return new Promise((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      output += String(chunk);
      if (output.includes("ready") && !child.killed) child.kill(signal);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += String(chunk);
    });
    child.on("exit", (code, exitSignal) => resolve({ output, code, signal: exitSignal }));
  });
}

/* Windows cannot send a process a signal it can handle: `kill` ends it at once. */
describe.skipIf(process.platform === "win32")("a server with default signal handling", () => {
  it("lets a host that handles SIGTERM itself finish its cleanup", async () => {
    const file = host(
      [
        "process.on('SIGTERM', async () => {",
        "  await new Promise((resolve) => setTimeout(resolve, 1500));",
        "  console.log('host cleanup done');",
        "  process.exit(3);",
        "});",
      ].join("\n"),
    );

    const run = await signalled(file, "SIGTERM");

    expect(run.output).toContain("host cleanup done");
    expect(run.code).toBe(3);
  }, 30_000);

  it("ends the process itself once drained when nothing else handles the signal", async () => {
    /* A timer keeps the process alive, so only the server can end it. */
    const file = host("setInterval(() => {}, 1000);");

    const run = await signalled(file, "SIGTERM");

    expect(run.output).toContain("Server stopped");
    expect(run.code).toBe(0);
  }, 30_000);

  it("drains on SIGINT too", async () => {
    const file = host("setInterval(() => {}, 1000);");

    const run = await signalled(file, "SIGINT");

    expect(run.output).toContain("Server stopped");
    expect(run.code).toBe(0);
  }, 30_000);
});

describe("setupSignalHandlers", () => {
  it("listens for SIGTERM and SIGINT once, however many servers ask", () => {
    const before = { term: process.listenerCount("SIGTERM"), int: process.listenerCount("SIGINT") };

    const detachFirst = setupSignalHandlers(async () => {});
    const detachSecond = setupSignalHandlers(async () => {});

    expect(process.listenerCount("SIGTERM")).toBe(before.term + 1);
    expect(process.listenerCount("SIGINT")).toBe(before.int + 1);
    detachFirst();
    detachSecond();
  });

  it("stops listening once every server has let go", () => {
    const before = process.listenerCount("SIGTERM");
    const detachFirst = setupSignalHandlers(async () => {});
    const detachSecond = setupSignalHandlers(async () => {});

    detachFirst();
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    detachSecond();

    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});
