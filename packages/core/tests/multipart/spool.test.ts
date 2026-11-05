/**
 * An upload's folder that a process leaves behind when it exits mid-call:
 * removed as the process exits, since the call that would have removed it
 * never ends — and, left by a process stopped by a signal it does not
 * handle, which runs no exit handler, removed by the next process on the
 * host as it makes its first folder there.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diskStore } from "../../src/adapter/multipart/disk-store";
import { nodeDisk } from "../../src/adapter/multipart/node-disk";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "courier-spool-test-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("an upload's folder", () => {
  it("is removed when the process exits before the call lets it go", () => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const script = join(__dirname, "../fixtures/spool-left-at-exit.ts");

    const run = spawnSync(process.execPath, ["--import", tsx, script, directory], {
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("1");
    expect(readdirSync(directory)).toEqual([]);
  });

  it.each([["SIGTERM"], ["SIGINT"]] as const)(
    "left by a process stopped by %s it does not handle is removed by the next one",
    async (signal) => {
      const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
      const script = join(__dirname, "../fixtures/spool-stopped-by-signal.ts");
      const stopped = spawn(process.execPath, ["--import", tsx, script, directory]);
      await new Promise<void>((resolve) => {
        stopped.stdout.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("ready")) resolve();
        });
      });
      stopped.kill(signal);
      await new Promise((resolve) => stopped.once("exit", resolve));
      const [left] = readdirSync(directory);
      expect(left).toBeDefined();
      /* As old as a call it could still belong to may last: past the body's timeout. */
      const past = new Date(Date.now() - 10 * 60_000);
      utimesSync(join(directory, left ?? ""), past, past);

      const disk = nodeDisk();
      if (disk === undefined) throw new Error("this runtime has no disk for uploads");
      const store = diskStore({ disk, directory, memoryBytes: 0, slabBytes: 16 });
      const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      });
      await store.file({ name: "f", filename: "b.bin", type: undefined, body });

      await vi.waitFor(() => expect(readdirSync(directory)).not.toContain(left));
      await store.release();
      expect(readdirSync(directory)).toEqual([]);
    },
    30_000,
  );
});
