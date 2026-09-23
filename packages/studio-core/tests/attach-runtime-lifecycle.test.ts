/**
 * Attaching and detaching a runtime, as scripts and test suites do.
 *
 * Two calls made while the first still loaded the config each opened a
 * socket under the same id, and only one could be closed; a detach() made
 * before the socket existed found nothing to close and left it connected;
 * and a process that attached never exited while Studio was not running.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const opened: Array<{ disconnected: boolean; options: Record<string, unknown> }> = [];

vi.mock("socket.io-client", () => ({
  io: (_url: string, options: Record<string, unknown>) => {
    const socket = {
      connected: false,
      disconnected: false,
      options,
      on: () => socket,
      emit: () => socket,
      removeAllListeners: () => socket,
      disconnect: () => {
        socket.disconnected = true;
        return socket;
      },
    };
    opened.push(socket);
    return socket;
  },
}));

const { attachRuntime, _resetRuntimeHandlesForTests } = await import("../src/runtime/attach-runtime");

const settle = () => new Promise((r) => setTimeout(r, 50));

afterEach(() => {
  _resetRuntimeHandlesForTests();
  opened.length = 0;
});

describe("attachRuntime", () => {
  it("shares one attach between calls made while the first is still under way", async () => {
    const [first, second] = await Promise.all([attachRuntime("task"), attachRuntime("task")]);
    await settle();

    expect(second).toBe(first);
    expect(opened).toHaveLength(1);
  });

  it("closes the socket of a runtime detached before the socket opened", async () => {
    const handle = await attachRuntime("early-detach");
    handle.detach();
    await settle();

    expect(opened).toHaveLength(1);
    expect(opened[0]?.disconnected).toBe(true);
  });

  it("does not let the Studio socket hold the process open", async () => {
    await attachRuntime("unref");
    await settle();

    expect(opened[0]?.options.autoUnref).toBe(true);
  });
});

describe("a process that attached", () => {
  it("exits when its work is done, with no Studio running", () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-attach-"));
    const script = join(dir, "task.mts");
    const entry = resolve(__dirname, "../src/runtime/attach-runtime.ts");
    writeFileSync(
      script,
      `process.env.COURIER_STUDIO_URL = "http://127.0.0.1:1";\n` +
        `const { attachRuntime } = await import(${JSON.stringify(entry)});\n` +
        `await attachRuntime("cli-task");\n`,
    );

    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const run = spawnSync(process.execPath, ["--import", tsx, script], {
      cwd: dir,
      timeout: 15_000,
      encoding: "utf8",
    });

    expect(run.error).toBeUndefined();
    expect(run.status).toBe(0);
  }, 20_000);
});
