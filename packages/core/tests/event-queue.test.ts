/**
 * How the queue behind a subscription ends: finished, failed, or left early
 * by its reader; and that it lets go of each event its reader took, as a
 * subscription quiet after a burst would hold them for good.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { createEventQueue } from "../src/realtime/sse/event-queue";

describe("createEventQueue", () => {
  it("delivers what is buffered, then the failure", async () => {
    const queue = createEventQueue<number>();
    const iterator = queue.iterator();
    queue.push({ data: 1 });

    queue.fail(new Error("stream failed"));

    await expect(iterator.next()).resolves.toEqual({ value: { data: 1 }, done: false });
    await expect(iterator.next()).rejects.toThrow("stream failed");
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("rejects a reader already waiting when the stream fails", async () => {
    const queue = createEventQueue<number>();
    const waiting = queue.iterator().next();

    queue.fail(new Error("stream failed"));

    await expect(waiting).rejects.toThrow("stream failed");
  });

  it("ignores a failure after the stream finished", async () => {
    const queue = createEventQueue<number>();
    const iterator = queue.iterator();

    queue.finish();
    queue.fail(new Error("too late"));

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("tells its owner when the reader leaves a for await early", async () => {
    const queue = createEventQueue<number>();
    const onReturn = vi.fn();
    queue.push({ data: 1 });
    queue.push({ data: 2 });

    for await (const _event of queue.iterator(onReturn)) break;

    expect(onReturn).toHaveBeenCalledOnce();
  });

  it("ends for the reader once it has left, buffered events included", async () => {
    const queue = createEventQueue<number>();
    const iterator = queue.iterator();
    queue.push({ data: 1 });

    await iterator.return?.();

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });
});

describe("the queue's memory", () => {
  it("lets go of each event its reader took", () => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const script = join(__dirname, "fixtures/event-queue-after-reading.ts");

    const run = spawnSync(process.execPath, ["--expose-gc", "--import", tsx, script], {
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status, run.stderr).toBe(0);
    const { held, size, left } = JSON.parse(run.stdout) as Record<string, number>;
    expect([held, size], "the control: all held before they are read").toEqual([1000, 0]);
    expect(left, "the last one read may still be the reader's").toBeLessThanOrEqual(1);
  });
});
