import { describe, expect, it } from "vitest";

import { interruptible } from "../../src/apply/interruptible";

const stops = () => [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];

describe("interruptible", () => {
  it("aborts the work's signal on Ctrl+C, listens for SIGTERM too while it runs, and leaves the process's own stops after", async () => {
    const before = stops();

    const during = await interruptible(async (signal) => {
      const listening = stops();
      process.emit("SIGINT");
      return { listening, aborted: signal.aborted };
    });

    expect(during).toEqual({ listening: before.map((count) => count + 1), aborted: true });
    expect(stops()).toEqual(before);
  });

  it("leaves the stops as they were when the work fails", async () => {
    const before = stops();

    await expect(
      interruptible(async () => {
        throw new Error("the work failed");
      }),
    ).rejects.toThrow("the work failed");
    expect(stops()).toEqual(before);
  });
});
