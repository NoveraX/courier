import { describe, expect, it } from "vitest";

import { createAdmissionQueue } from "../../src/middleware/admission-queue";

function pendingTimers(): number {
  return process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
}

describe("createAdmissionQueue", () => {
  it("refuses a caller whose signal has already aborted without spending a turn", async () => {
    const queue = createAdmissionQueue(1, 5000);
    const controller = new AbortController();
    controller.abort(new Error("gone"));

    await expect(queue.enter(controller.signal)).rejects.toThrow("gone");
    const started = performance.now();
    await queue.enter(undefined);

    expect(performance.now() - started).toBeLessThan(100);
  });

  it("rejects a waiting caller with its signal's reason when it cancels", async () => {
    const queue = createAdmissionQueue(1, 5000);
    await queue.enter(undefined);
    const controller = new AbortController();
    const waiting = queue.enter(controller.signal);

    controller.abort(new Error("changed my mind"));

    await expect(waiting).rejects.toThrow("changed my mind");
  });

  it("stops its timer once every waiting caller has cancelled", async () => {
    const queue = createAdmissionQueue(1, 60_000);
    await queue.enter(undefined);
    const before = pendingTimers();
    const controllers = [new AbortController(), new AbortController()];
    const waiting = controllers.map((controller) => queue.enter(controller.signal));
    expect(pendingTimers()).toBe(before + 1);

    for (const controller of controllers) controller.abort();

    await Promise.allSettled(waiting);
    expect(pendingTimers()).toBe(before);
  });

  it("lets waiting callers through in the order they arrived", async () => {
    const queue = createAdmissionQueue(1, 50);
    const order: number[] = [];

    await Promise.all(
      [0, 1, 2, 3].map(async (index) => {
        await queue.enter(undefined);
        order.push(index);
      }),
    );

    expect(order).toEqual([0, 1, 2, 3]);
  });
});
