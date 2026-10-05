/**
 * A pooled socket nobody is subscribed on waits a moment to be reused, and
 * is not reopened when it drops meanwhile: the drop closes it, quietly, and
 * the next subscription opens a socket of its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acquireConnection, clearWSConnectionPool } from "../src/realtime/caller-ws";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";

class FakeSocket implements WSClientSocket {
  static opened: FakeSocket[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;
  bufferedAmount = 0;

  constructor(public url: string) {
    FakeSocket.opened.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  drop(code: number): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

const config = {
  socketFactory: (url: string) => new FakeSocket(url),
  backoff: { initialMs: 100, jitter: false },
  heartbeat: { intervalMs: 100_000, timeoutMs: 50_000 },
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.opened = [];
});

afterEach(() => {
  clearWSConnectionPool();
  vi.useRealTimers();
});

describe("an idle pooled socket", () => {
  it("is closed, not reopened, when it drops while nobody is subscribed", () => {
    const lease = acquireConnection("ws://test/ws", config);
    FakeSocket.opened[0]?.open();
    const stop = lease.connection.subscribe("room", () => {});
    stop();
    lease.release();

    FakeSocket.opened[0]?.drop(1006);
    vi.advanceTimersByTime(5_000);

    expect(FakeSocket.opened).toHaveLength(1);
    expect(lease.connection.status).toBe("disconnected");
  });

  it("is still reopened when it drops while a subscription uses it", () => {
    const lease = acquireConnection("ws://test/ws", config);
    FakeSocket.opened[0]?.open();
    lease.connection.subscribe("room", () => {});

    FakeSocket.opened[0]?.drop(1006);
    vi.advanceTimersByTime(100);

    expect(FakeSocket.opened).toHaveLength(2);
    lease.release();
  });

  it("gives the next subscription a socket of its own once it closed", () => {
    const first = acquireConnection("ws://test/ws", config);
    FakeSocket.opened[0]?.open();
    first.release();
    FakeSocket.opened[0]?.drop(1006);

    const next = acquireConnection("ws://test/ws", config);

    expect(next.connection).not.toBe(first.connection);
    expect(FakeSocket.opened).toHaveLength(2);
    next.release();
  });
});
