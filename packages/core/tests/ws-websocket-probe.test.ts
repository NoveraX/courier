/**
 * While HTTP carries a connection, its path is probed for a WebSocket
 * getting through again: a WebSocket that sends a `ping` before any `auth`,
 * which the server answers with `pong` and admits nothing for. The first
 * probe goes within 30 s, each after one not answered within twice as long,
 * up to 5 minutes, and one goes at once on the page's resume signals, one
 * in 30 s at most. A probe answered with `pong` in time is closed normally
 * and ends the watch; one refused, dropped, answered otherwise or not in
 * time is let go of, and the next comes later.
 */
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { type WebSocketWatch, watchForWebSocket } from "../src/realtime/ws/websocket-probe";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";

const AFTER_MS = 100;
const SECOND = 1000;

class Probe implements WSClientSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen: WSClientSocket["onopen"] = null;
  onmessage: WSClientSocket["onmessage"] = null;
  onclose: WSClientSocket["onclose"] = null;
  onerror: WSClientSocket["onerror"] = null;
  readonly sent: string[] = [];
  closedWith: { code?: number | undefined; reason?: string | undefined } | undefined;

  constructor(readonly at: number) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  opens(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  says(data: string): void {
    this.onmessage?.({ data });
  }

  /** Let go of: nothing it does is heard any more. */
  get unheard(): boolean {
    return this.onopen === null && this.onmessage === null && this.onclose === null;
  }
}

let probes: Probe[] = [];
let climbed: Mock<() => void>;
let start = 0;
const ends: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  probes = [];
  climbed = vi.fn<() => void>();
  start = performance.now();
});

afterEach(() => {
  for (const end of ends.splice(0)) end();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function watch(options: Partial<WebSocketWatch> = {}): () => void {
  const end = watchForWebSocket({
    open: () => {
      const probe = new Probe(performance.now() - start);
      probes.push(probe);
      return probe;
    },
    afterMs: AFTER_MS,
    resume: true,
    climbed,
    random: () => 1,
    ...options,
  });
  ends.push(end);
  return end;
}

/* The probe opened last, which opens and gets no answer in time. */
function unanswered(): void {
  probes.at(-1)?.opens();
  vi.advanceTimersByTime(AFTER_MS);
}

/* A page, whose window gives the resume signals. */
function page(): EventTarget {
  const window = new EventTarget();
  vi.stubGlobal("window", window);
  return window;
}

describe("a probe for a WebSocket", () => {
  it("goes within 30 s, a WebSocket that pings before any auth, and climbs on the pong", () => {
    watch({ random: () => 0.5 });

    vi.advanceTimersByTime(22_499);
    expect(probes).toHaveLength(0);
    vi.advanceTimersByTime(1);
    const [probe] = probes as [Probe];
    probe.opens();
    probe.says('{"type":"pong"}');

    expect(probe.sent).toEqual(['{"type":"ping"}']);
    expect(climbed).toHaveBeenCalledOnce();
    expect(probe.closedWith).toEqual({ code: 1000, reason: "" });
    expect(probe.unheard).toBe(true);
    vi.advanceTimersByTime(3_600_000);
    expect(probes).toHaveLength(1);
  });

  it("waits twice as long after each probe not answered, up to 5 minutes", () => {
    watch();

    for (let probe = 0; probe < 6; probe++) {
      vi.advanceTimersToNextTimer();
      unanswered();
    }

    const waits = probes.map((probe, n) => probe.at - (probes[n - 1]?.at ?? 0));
    expect(waits).toEqual([30_000, 60_100, 120_100, 240_100, 300_100, 300_100]);
    expect(climbed).not.toHaveBeenCalled();
  });

  it("waits the second half of each wait at least, the clients one outage moved spread over it", () => {
    watch({ random: () => 0 });

    vi.advanceTimersByTime(15_000);
    unanswered();
    vi.advanceTimersByTime(30_000);

    expect(probes.map((probe) => probe.at)).toEqual([15_000, 45_100]);
  });

  it.each([
    [
      "refused",
      (probe: Probe) => {
        probe.readyState = 3;
        probe.onerror?.({ type: "error" });
        probe.onclose?.({ code: 1006, reason: "" });
      },
      undefined,
    ],
    [
      "dropped once open",
      (probe: Probe) => {
        probe.opens();
        probe.readyState = 3;
        probe.onclose?.({ code: 1006, reason: "" });
      },
      undefined,
    ],
    [
      "answered with another frame",
      (probe: Probe) => {
        probe.opens();
        probe.says('{"type":"auth_error","error":{"code":4429,"message":"Too many"},"v":2}');
      },
      { code: 4100, reason: "Not answered in time" },
    ],
    [
      "not answered in time",
      (probe: Probe) => {
        probe.opens();
        vi.advanceTimersByTime(AFTER_MS);
      },
      { code: 4100, reason: "Not answered in time" },
    ],
    [
      "never opened in time",
      () => vi.advanceTimersByTime(AFTER_MS),
      { code: 4100, reason: "Not answered in time" },
    ],
  ])("is let go of when %s, and another follows later", (_what, fails, closedWith) => {
    watch();
    vi.advanceTimersByTime(30_000);
    const [probe] = probes as [Probe];

    fails(probe);
    probe.says('{"type":"pong"}');
    vi.advanceTimersByTime(60_000);

    expect(probe.unheard).toBe(true);
    expect(probe.closedWith).toEqual(closedWith);
    expect(climbed).not.toHaveBeenCalled();
    expect(probes).toHaveLength(2);
  });

  it("counts a socket that cannot be made as a probe not answered", async () => {
    let made = 0;
    watch({
      open: () => {
        made++;
        throw new Error("no sockets here");
      },
    });

    vi.advanceTimersByTime(30_000);
    await Promise.resolve();
    vi.advanceTimersByTime(60_000);

    expect(made).toBe(2);
    expect(climbed).not.toHaveBeenCalled();
  });
});

describe("the page's resume signals", () => {
  it("send a probe at once, one in 30 s at most, counted from the last", () => {
    const window = page();
    watch();

    vi.advanceTimersByTime(5 * SECOND);
    window.dispatchEvent(new Event("online"));
    expect(probes).toHaveLength(0);
    vi.advanceTimersByTime(25 * SECOND);
    unanswered();
    vi.advanceTimersByTime(15 * SECOND);
    window.dispatchEvent(new Event("online"));
    expect(probes).toHaveLength(1);
    vi.advanceTimersByTime(16 * SECOND);
    window.dispatchEvent(new Event("focus"));
    const resumed = probes[1] as Probe;
    resumed.opens();
    resumed.says('{"type":"pong"}');

    expect(resumed.at).toBe(61_100);
    expect(climbed).toHaveBeenCalledOnce();
  });

  it("send none while a probe is under way, however long it may take", () => {
    const window = page();
    watch({ afterMs: 40_000 });

    vi.advanceTimersByTime(30_000);
    (probes[0] as Probe).opens();
    vi.advanceTimersByTime(31_000);
    window.dispatchEvent(new Event("online"));

    expect(probes).toHaveLength(1);
  });

  it("send none for a connection that asked for none", () => {
    const window = page();
    watch({ resume: false });

    vi.advanceTimersByTime(30_000);
    unanswered();
    vi.advanceTimersByTime(40 * SECOND);
    window.dispatchEvent(new Event("online"));

    expect(probes).toHaveLength(1);
  });
});

describe("a watch ended", () => {
  it("lets go of a probe under way, sends no other, and never climbs", () => {
    const window = page();
    const end = watch();

    vi.advanceTimersByTime(30_000);
    const [probe] = probes as [Probe];
    probe.opens();
    end();
    vi.advanceTimersByTime(3_600_000);
    window.dispatchEvent(new Event("online"));

    expect(probe.unheard).toBe(true);
    expect(probe.closedWith).toEqual({ code: 4100, reason: "Not answered in time" });
    expect(probes).toHaveLength(1);
    expect(climbed).not.toHaveBeenCalled();
  });
});
