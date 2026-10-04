/**
 * An error nothing caught ended the Studio process at once,
 * cutting every request and stream in flight. Studio closes
 * first, then exits with status 1.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeOnFatal } from "../src/close-on-fatal";

class FakeProcess extends EventEmitter {
  readonly exit = vi.fn<(code: number) => void>();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("closeOnFatal", () => {
  it.each(["uncaughtException", "unhandledRejection"] as const)(
    "closes Studio on an %s, then exits with 1",
    async (event) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const proc = new FakeProcess();
      let finish: () => void = () => undefined;
      const stop = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      closeOnFatal(stop, proc);

      proc.emit(event, new Error("boom"));
      expect(stop).toHaveBeenCalledTimes(1);
      expect(proc.exit).not.toHaveBeenCalled();
      finish();
      await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(1));
    },
  );

  it("closes once when a second error arrives while it stops", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const proc = new FakeProcess();
    const stop = vi.fn(() => Promise.resolve());
    closeOnFatal(stop, proc);

    proc.emit("uncaughtException", new Error("first"));
    proc.emit("unhandledRejection", new Error("second"));
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled());

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("exits even when closing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const proc = new FakeProcess();
    closeOnFatal(() => Promise.reject(new Error("socket stuck")), proc);

    proc.emit("uncaughtException", new Error("boom"));

    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(1));
  });
});
