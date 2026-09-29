/**
 * Regression coverage for the executeWSChannel/executeWSPush "reconnecting"
 * status forwarding fix.
 *
 * # The bug
 *
 * Before the fix, both `executeWSChannel` and `executeWSPush` filtered the
 * underlying WSConnection's status events to forward only `connected` and
 * `disconnected`. When the very first connect attempt failed (e.g. the
 * server was not reachable yet, closing with 1006), the underlying
 * connection transitioned `connecting → reconnecting → connecting → …`
 * forever. The channel-level state observable by callers stayed pinned at
 * `"connecting"` because `reconnecting` was being dropped on the floor.
 *
 * The Studio Playground proxy executor's first-attempt watchdog
 * (`playground-ws-executor.ts:executeProxyWS`) listens for the
 * `reconnecting` transition to detect "the upgrade never succeeded once" and
 * surface a clean error to the UI instead of letting the playground entry
 * hang indefinitely. With the bug, the watchdog never fired and the user
 * saw `CONNECTING` forever — exactly the symptom the user reported.
 *
 * # What this test guards
 *
 * The forward path: a failed first connect on the underlying WSConnection
 * propagates `reconnecting` through the channel/push state container so
 * external `on("status", …)` listeners observe it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";

class MockSocket implements WSClientSocket {
  static instances: MockSocket[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;
  bufferedAmount = 0;

  constructor() {
    MockSocket.instances.push(this);
  }

  send(_data: string): void {}
  close(_code?: number, _reason?: string): void {
    this.readyState = 3;
  }

  fail(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

function mockFactory(): WSClientSocket {
  return new MockSocket();
}

/**
 * Drain the microtask queue enough times for `executeWSChannel`/`executeWSPush`
 * to work past their internal `await Promise.resolve()` and register the
 * `conn.onStatusChange` listener that forwards events into the channel
 * state container.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

beforeEach(() => {
  MockSocket.instances = [];
  clearWSConnectionPool();
});

afterEach(() => {
  clearWSConnectionPool();
});

describe("executeWSChannel — status forwarding", () => {
  it("forwards `reconnecting` to channel-level state when first connect fails", async () => {
    const channel = executeWSChannel("ws://test/ws-channel-1", "src.grp.method", undefined, {
      socketFactory: mockFactory,
      backoff: { initialMs: 100_000, jitter: false },
    });
    await flushMicrotasks();

    const seen: string[] = [];
    channel.on("status", (s) => seen.push(s));

    expect(MockSocket.instances).toHaveLength(1);
    MockSocket.instances[0]!.fail(1006);

    expect(channel.status).toBe("reconnecting");
    expect(seen).toContain("reconnecting");
    channel.close();
  });
});

describe("executeWSPush — status forwarding", () => {
  it("forwards `reconnecting` to push-level state when first connect fails", async () => {
    const sub = executeWSPush("ws://test/ws-push-1", "src.grp.method", undefined, {
      socketFactory: mockFactory,
      backoff: { initialMs: 100_000, jitter: false },
    });
    await flushMicrotasks();

    const seen: string[] = [];
    sub.on("status", (s) => seen.push(s));

    expect(MockSocket.instances).toHaveLength(1);
    MockSocket.instances[0]!.fail(1006);

    expect(sub.status).toBe("reconnecting");
    expect(seen).toContain("reconnecting");
    sub.close();
  });
});
