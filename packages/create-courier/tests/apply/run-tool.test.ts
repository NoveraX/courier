import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { runTool, toolFailure } from "../../src/apply/run-tool";
import { SETUP_LIMITS } from "../../src/limits";

/* A Node program of its own, run as a tool. */
function node(script: string): string[] {
  return [process.execPath, "-e", script];
}

const FOREVER = "setInterval(() => {}, 60_000);";

/* A program that starts one that sleeps, says its pid, and sleeps itself. */
const SPAWNS_SLEEPER = `const { spawn } = require("node:child_process");
const sleeper = spawn(process.execPath, ["-e", ${JSON.stringify(FOREVER)}], { stdio: "ignore" });
console.log(sleeper.pid);
${FOREVER}`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* Whether a process is gone within a second of its signal. */
async function gone(pid: number): Promise<boolean> {
  for (let waited = 0; waited < 1_000; waited += 50) {
    if (!alive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !alive(pid);
}

describe("runTool", () => {
  it("reads a program's output a line at a time, both streams, and tells its exit status", async () => {
    const lines: string[] = [];

    const result = await runTool(
      node('console.log("one\\ntwo"); console.error("three"); process.exitCode = 3;'),
      {
        cwd: process.cwd(),
        output: { kind: "lines", line: (line) => lines.push(line) },
        deadlineMs: 30_000,
      },
    );

    expect(result.status).toBe(3);
    expect(result.stopped).toBeUndefined();
    expect([...lines].sort()).toEqual(["one", "three", "two"]);
  });

  it("keeps only the end of what a quiet program prints", async () => {
    const result = await runTool(node('process.stdout.write("x".repeat(1_000_000) + "end");'), {
      cwd: process.cwd(),
      output: { kind: "quiet" },
      deadlineMs: 30_000,
    });

    expect(result.status).toBe(0);
    expect(result.tail.length).toBe(SETUP_LIMITS.tailChars);
    expect(result.tail.endsWith("xend")).toBe(true);
  });

  it("stops a program past its time, and says so", async () => {
    const command = node(FOREVER);

    const result = await runTool(command, {
      cwd: process.cwd(),
      output: { kind: "quiet" },
      deadlineMs: 200,
    });

    expect(result.stopped).toBe("deadline");
    expect(result.status).not.toBe(0);
    expect(toolFailure(["npm", "install"], result, 20 * 60_000)).toBe(
      "npm install was stopped after 20 minutes",
    );
  });

  it("stops a program once the person cancels, and starts none once they have", async () => {
    const cancel = new AbortController();
    const running = runTool(node(`console.log("ready"); ${FOREVER}`), {
      cwd: process.cwd(),
      output: { kind: "lines", line: (line) => line === "ready" && cancel.abort() },
      deadlineMs: 30_000,
      signal: cancel.signal,
    });

    const result = await running;
    const late = await runTool(node(FOREVER), {
      cwd: process.cwd(),
      output: { kind: "quiet" },
      deadlineMs: 30_000,
      signal: cancel.signal,
    });

    expect(result.stopped).toBe("cancelled");
    expect(late).toEqual({ status: 1, stopped: "cancelled", tail: "" });
  });

  it.skipIf(process.platform === "win32")(
    "stops what a program started too, past its time and once the person cancels",
    async () => {
      const started: number[] = [];
      const run = (options: { deadlineMs: number; signal?: AbortSignal }, cancel?: () => void) =>
        runTool(node(SPAWNS_SLEEPER), {
          cwd: process.cwd(),
          output: {
            kind: "lines",
            line: (line) => {
              started.push(Number(line));
              cancel?.();
            },
          },
          ...options,
        });
      const cancel = new AbortController();

      try {
        const late = await run({ deadlineMs: 1_000 });
        const cancelled = await run({ deadlineMs: 30_000, signal: cancel.signal }, () =>
          cancel.abort(),
        );

        expect([late.stopped, cancelled.stopped]).toEqual(["deadline", "cancelled"]);
        expect(started).toHaveLength(2);
        expect(await Promise.all(started.map(gone))).toEqual([true, true]);
      } finally {
        for (const pid of started) if (alive(pid)) process.kill(pid, "SIGKILL");
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "stops a program and all it started when the process is asked to stop, the run taking the signal",
    async () => {
      const started: number[] = [];
      /* The run's own listener, as a transaction's: with it, the stop is the run's to end. */
      const ours = () => undefined;
      process.on("SIGTERM", ours);

      try {
        const result = await runTool(node(SPAWNS_SLEEPER), {
          cwd: process.cwd(),
          output: {
            kind: "lines",
            line: (line) => {
              started.push(Number(line));
              process.emit("SIGTERM");
            },
          },
          deadlineMs: 30_000,
        });

        expect(result.stopped).toBe("cancelled");
        expect(process.listenerCount("SIGTERM")).toBe(1);
        expect(await Promise.all(started.map(gone))).toEqual([true]);
      } finally {
        process.off("SIGTERM", ours);
        for (const pid of started) if (alive(pid)) process.kill(pid, "SIGKILL");
      }
    },
  );

  it("shows a program's output on standard error where standard output carries the JSON document", () => {
    /* By its URL: Windows writes an absolute path with its drive first, which the loader
       reads as a URL's scheme. */
    const runner = new URL("../../src/apply/run-tool.ts", import.meta.url).href;
    const script = `
      import { runTool } from ${JSON.stringify(runner)};
      await runTool([process.execPath, "-e", "console.log('installing')"], {
        cwd: process.cwd(), output: { kind: "show", on: "stderr" }, deadlineMs: 30000,
      });`;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("installing");
  });

  it("refuses with the program's name when it cannot be started", async () => {
    await expect(
      runTool(["courier-no-such-program"], {
        cwd: process.cwd(),
        output: { kind: "quiet" },
        deadlineMs: 30_000,
      }),
    ).rejects.toThrow("courier-no-such-program could not be started:");
  });

  it("says how a program failed: its exit status, or that it was cancelled", () => {
    expect(toolFailure(["pnpm", "add", "zod"], { status: 1, tail: "" }, 1000)).toBe(
      "pnpm add zod failed (exit 1)",
    );
    expect(toolFailure(["pnpm", "add"], { status: 1, stopped: "cancelled", tail: "" }, 1000)).toBe(
      "pnpm add was cancelled",
    );
  });
});
