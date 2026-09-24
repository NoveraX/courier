/**
 * The chain Studio's reloads and edits of the watched files run on: one at a
 * time, in order, with a burst of saves reloading once and an edit running
 * alone between what came before it and what came during it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReloadQueue } from "../src/server/reload-queue";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function recorder(durationMs = 20) {
  const log: string[] = [];
  const runs: string[][] = [];
  const reload = async (changed: string[]) => {
    runs.push(changed);
    log.push(`start ${changed.join(",")}`);
    await sleep(durationMs);
    log.push(`end ${changed.join(",")}`);
  };
  return { log, runs, reload };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createReloadQueue", () => {
  it("starts a reload only once the one before it has finished", async () => {
    const { log, reload } = recorder();
    const queue = createReloadQueue(reload);

    queue.request(["a"]);
    await sleep(5);
    queue.request(["b"]);
    await queue.settled();

    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("reloads once for the requests that arrive while a reload waits", async () => {
    const { runs, reload } = recorder();
    const queue = createReloadQueue(reload);

    queue.request(["a"]);
    await sleep(5);
    queue.request(["b"]);
    queue.request(["c", "b"]);
    await queue.settled();

    expect(runs).toEqual([["a"], ["b", "c"]]);
  });

  it("runs an edit after what was queued before it and before what is requested during it", async () => {
    const { log, reload } = recorder();
    const queue = createReloadQueue(reload);

    queue.request(["before"]);
    const edit = queue.exclusive(async () => {
      log.push("edit start");
      queue.request(["during"]);
      await sleep(20);
      log.push("edit end");
      return "done";
    });

    await expect(edit).resolves.toBe("done");
    await queue.settled();
    expect(log).toEqual(["start before", "end before", "edit start", "edit end", "start during", "end during"]);
  });

  it("does not let a request made during an edit join the reload queued before it", async () => {
    const { runs, reload } = recorder();
    const queue = createReloadQueue(reload);

    queue.request(["before"]);
    const edit = queue.exclusive(async () => undefined);
    queue.request(["after"]);
    await edit;
    await queue.settled();

    expect(runs).toEqual([["before"], ["after"]]);
  });

  it("drops forgotten paths from the waiting reload, and skips a reload left with none", async () => {
    const { runs, reload } = recorder();
    const queue = createReloadQueue(reload);

    await queue.exclusive(async () => {
      queue.request(["written", "other"]);
      queue.forget(["written"]);
    });
    await queue.exclusive(async () => {
      queue.request(["written"]);
      queue.forget(["written"]);
    });
    await queue.settled();

    expect(runs).toEqual([["other"]]);
  });

  it("keeps going after a reload fails, and logs the failure", async () => {
    const runs: string[] = [];
    const queue = createReloadQueue(async ([path]) => {
      runs.push(path ?? "");
      if (path === "bad") throw new Error("broken");
    });

    queue.request(["bad"]);
    await sleep(5);
    queue.request(["good"]);
    await queue.settled();

    expect(runs).toEqual(["bad", "good"]);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("hands an edit's failure to its caller and keeps going", async () => {
    const { runs, reload } = recorder();
    const queue = createReloadQueue(reload);

    const edit = queue.exclusive(async () => {
      throw new Error("edit failed");
    });
    queue.request(["after"]);

    await expect(edit).rejects.toThrow("edit failed");
    await queue.settled();
    expect(runs).toEqual([["after"]]);
  });

  it("is settled only once work queued while it waited has run too", async () => {
    const { runs, reload } = recorder();
    const queue = createReloadQueue(reload);

    queue.request(["a"]);
    const settled = queue.settled();
    await sleep(5);
    queue.request(["b"]);
    await settled;

    expect(runs).toEqual([["a"], ["b"]]);
  });

  it("lets edits settle without waiting for reloads still running", async () => {
    const { log, reload } = recorder(200);
    const queue = createReloadQueue(reload);
    let editDone = false;

    const edit = queue.exclusive(async () => {
      editDone = true;
    });
    queue.request(["after"]);
    await queue.exclusiveSettled();

    expect(editDone).toBe(true);
    expect(log).toEqual(["start after"]);
    await edit;
    await queue.settled();
  });

  it("waits for an edit requested while edits were settling", async () => {
    const queue = createReloadQueue(async () => undefined);
    const order: string[] = [];

    queue.exclusive(async () => {
      order.push("first");
      queue.exclusive(async () => {
        order.push("second");
      });
    });
    await queue.exclusiveSettled();

    expect(order).toEqual(["first", "second"]);
  });

  it("drops an acknowledged path from a reload queued between two edits", async () => {
    const { runs, reload } = recorder();
    const queue = createReloadQueue(reload);
    let firstDone = () => {};
    const first = queue.exclusive(
      () =>
        new Promise<void>((resolve) => {
          firstDone = resolve;
        }),
    );
    await sleep(5);
    queue.request(["written"]);
    const second = queue.exclusive(async () => undefined);
    queue.forget(["written"]);
    firstDone();
    await first;
    await second;
    await queue.settled();

    expect(runs).toEqual([]);
  });

  it("no longer counts an edit dropped before it started", async () => {
    const { reload } = recorder();
    const queue = createReloadQueue(reload);
    let release = () => {};
    queue.exclusive(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await sleep(5);
    const dropped = new AbortController();
    queue.exclusive(async () => undefined, dropped.signal);
    const settled = queue.exclusiveSettled();

    dropped.abort();
    release();

    await expect(settled).resolves.toBeUndefined();
  });
});
