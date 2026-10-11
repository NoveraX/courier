/**
 * Studio closes when it is asked to stop, and exits with the status a shell
 * reports for the signal. A terminal's Ctrl+C reaches it twice when npm
 * started it, which passes the signal on: the second does not end Studio
 * halfway through closing — which left the file that tells editors where
 * it runs behind — while someone asking again later ends it at once.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeOnSignals } from "../src/close-on-signals";

class FakeProcess extends EventEmitter {
  readonly exit = vi.fn<(code: number) => void>();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("closeOnSignals", () => {
  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
  ] as const)("closes Studio on %s, then exits with %i", async (signal, status) => {
    const proc = new FakeProcess();
    let finish: () => void = () => undefined;
    const close = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    closeOnSignals(close, proc);

    proc.emit(signal);
    expect(close).toHaveBeenCalledTimes(1);
    expect(proc.exit).not.toHaveBeenCalled();
    finish();

    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(status));
  });

  it("closes once when npm passes the same Ctrl+C on, without ending Studio midway", () => {
    const proc = new FakeProcess();
    const close = vi.fn(() => new Promise<void>(() => undefined));
    closeOnSignals(close, proc, () => 1_000);

    proc.emit("SIGINT");
    proc.emit("SIGINT");

    expect(close).toHaveBeenCalledTimes(1);
    expect(proc.exit).not.toHaveBeenCalled();
  });

  it("ends Studio at once when someone asks again while it closes", () => {
    const proc = new FakeProcess();
    let time = 1_000;
    closeOnSignals(
      () => new Promise<void>(() => undefined),
      proc,
      () => time,
    );

    proc.emit("SIGINT");
    time += 1_500;
    proc.emit("SIGINT");

    expect(proc.exit).toHaveBeenCalledWith(130);
  });

  it("exits even when closing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const proc = new FakeProcess();
    closeOnSignals(() => Promise.reject(new Error("socket stuck")), proc);

    proc.emit("SIGTERM");

    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(143));
  });
});
