import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLiveness } from "../src/realtime/ws/liveness";

let ping: ReturnType<typeof vi.fn<() => void>>;
let onSilent: ReturnType<typeof vi.fn<(forMs: number) => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  ping = vi.fn<() => void>();
  onSilent = vi.fn<(forMs: number) => void>();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a socket's liveness watch", () => {
  it("takes the socket for dead once nothing came for the whole window", () => {
    const liveness = createLiveness({ ping, onSilent });
    liveness.watch(1000);

    vi.advanceTimersByTime(999);
    expect(onSilent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onSilent).toHaveBeenCalledWith(1000);
  });

  it("keeps a socket alive for as long as messages come", () => {
    const liveness = createLiveness({ ping, onSilent });
    liveness.watch(1000);

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(600);
      liveness.heard();
    }
    expect(onSilent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);

    expect(onSilent).toHaveBeenCalledTimes(1);
  });

  it("arms no timer per message on a busy socket", () => {
    const liveness = createLiveness({ ping, onSilent });
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    liveness.watch(1000);

    for (let i = 0; i < 10_000; i++) liveness.heard();

    expect(setTimer).toHaveBeenCalledTimes(1);
  });

  it("pings when asked, and takes the socket for dead if nothing answers in time", () => {
    const liveness = createLiveness({ ping, onSilent });
    liveness.watch(60_000);

    liveness.probe(500);
    expect(ping).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);

    expect(onSilent).toHaveBeenCalledWith(500);
  });

  it("is satisfied by any message after a probe", () => {
    const liveness = createLiveness({ ping, onSilent });
    liveness.watch(60_000);

    liveness.probe(500);
    vi.advanceTimersByTime(200);
    liveness.heard();
    vi.advanceTimersByTime(1000);

    expect(onSilent).not.toHaveBeenCalled();
  });

  it("probes once at a time", () => {
    const liveness = createLiveness({ ping, onSilent });
    liveness.watch(60_000);

    liveness.probe(500);
    liveness.probe(500);

    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("probes nothing while it watches no socket", () => {
    createLiveness({ ping, onSilent }).probe(500);

    expect(ping).not.toHaveBeenCalled();
  });

  it("tells nothing once stopped", () => {
    const liveness = createLiveness({ ping, onSilent });
    liveness.watch(1000);
    liveness.probe(500);

    liveness.stop();
    vi.advanceTimersByTime(5000);

    expect(onSilent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
