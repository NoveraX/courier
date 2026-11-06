/**
 * @vitest-environment jsdom
 *
 * A stream has the time a socket has to open, 15 s: from asking
 * `beforeConnect` for what it opens with to the server's answer. One that
 * takes longer — a balancer that took the request and never answers, a
 * refusal whose body never ends — is let go of and reconnected, a failed
 * attempt as a dropped one is, and says why. What a refusal says is read
 * from no more than 64 KiB of it. A channel whose socket's options are
 * still being found after as long — whose session it opens with, on a
 * server — ends with the error. The servers here are the test's own, under
 * fake timers: no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionError } from "../src/realtime/errors";
import { retryOf } from "../src/realtime/retry-of";
import { subscribeSSE } from "../src/realtime/sse/sse-client";
import type { SSEConnectInit, SubscribeSSEOptions } from "../src/realtime/sse/sse-types";
import type { CloseInfo, Subscription } from "../src/realtime/subscription-types";
import type { WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { executeWSPush } from "../src/realtime/ws-subscription";

const URL = "https://api.example.com/sse/feed";
const CHUNK = 16_384;

const subscriptions: Subscription<unknown>[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function open(options: SubscribeSSEOptions): Subscription<unknown> {
  const subscription = subscribeSSE(URL, {
    backoff: { initialMs: 1_000, jitter: false },
    ...options,
  });
  subscriptions.push(subscription);
  return subscription;
}

/* A request the server took and never answers: it ends only when aborted. */
function neverAnswered(calls: { count: number }): NonNullable<SubscribeSSEOptions["fetch"]> {
  return (_url, init) => {
    calls.count++;
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  };
}

/* A refusal of the status, its JSON body made of what `pull` gives. */
function refusedWith(
  status: number,
  statusText: string,
  pull: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void> | void,
): NonNullable<SubscribeSSEOptions["fetch"]> {
  return async () =>
    new Response(new ReadableStream<Uint8Array>({ pull }), {
      status,
      statusText,
      headers: { "Content-Type": "application/json" },
    });
}

/* A wait that never ends, as a body that has stopped sending is. */
const never = () => new Promise<void>(() => undefined);

describe("a stream's attempt to open", () => {
  it("is given up after 15 s of no answer, and reconnected, saying why", async () => {
    const calls = { count: 0 };
    const subscription = open({ fetch: neverAnswered(calls) });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(subscription.status).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1);
    expect(subscription.status).toBe("reconnecting");
    expect(retryOf(subscription)?.error).toBeInstanceOf(ConnectionError);
    expect(retryOf(subscription)?.error).toMatchObject({
      message: "The stream did not open in time",
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(calls.count).toBe(2);
  });

  it("counts the wait for beforeConnect in its 15 s", async () => {
    const calls = { count: 0 };
    const subscription = open({
      fetch: neverAnswered(calls),
      beforeConnect: () => new Promise<SSEConnectInit>(() => undefined),
    });

    await vi.advanceTimersByTimeAsync(15_000);

    expect([subscription.status, calls.count]).toEqual(["reconnecting", 0]);
    expect(retryOf(subscription)?.error).toMatchObject({
      message: "The stream did not open in time",
    });
  });

  it("counts a refusal's body in its 15 s, and keeps the refusal's status", async () => {
    let sent = false;
    const subscription = open({
      fetch: refusedWith(503, "Service Unavailable", (controller) => {
        if (sent) return never();
        sent = true;
        controller.enqueue(new TextEncoder().encode('{"message":"Slow'));
        return undefined;
      }),
    });

    await vi.advanceTimersByTimeAsync(15_000);

    expect(subscription.status).toBe("reconnecting");
    expect(retryOf(subscription)?.error).toMatchObject({
      statusCode: 503,
      reason: "Service Unavailable",
    });
  });
});

describe("a refusal", () => {
  it("is read no further than 64 KiB, and does not wait for an end that never comes", async () => {
    let read = 0;
    const subscription = open({
      fetch: refusedWith(503, "Service Unavailable", async (controller) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (read >= 1_048_576) return never();
        read += CHUNK;
        controller.enqueue(new Uint8Array(CHUNK).fill(0x20));
      }),
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(read).toBeLessThanOrEqual(65_536 + 2 * CHUNK);
    expect(subscription.status).toBe("reconnecting");
    expect(retryOf(subscription)?.error).toMatchObject({ reason: "Service Unavailable" });
  });

  it("over 64 KiB says its status text, not what it carries", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ message: "x".repeat(70_000) }));
    const subscription = open({
      fetch: refusedWith(403, "Forbidden", (controller) => {
        controller.enqueue(body);
        controller.close();
      }),
    });
    const ended = subscription[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);

    expect(await ended).toMatchObject({ code: 4403, message: "Forbidden" });
  });
});

describe("a channel whose socket's options are being found", () => {
  it("ends with the error after 15 s, and opens no socket when they come later", async () => {
    let found: (options: Partial<WSConnectionConfig>) => void = () => undefined;
    const options = new Promise<Partial<WSConnectionConfig> | undefined>((resolve) => {
      found = resolve;
    });
    const sockets: unknown[] = [];
    const channel = executeWSPush("wss://realtime.example.com/ws", "api.live.ticker", {}, options);
    subscriptions.push(channel);
    const closed: CloseInfo[] = [];
    channel.on("close", (info) => closed.push(info));

    await vi.advanceTimersByTimeAsync(14_999);
    expect(closed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    found({
      socketFactory: () => {
        sockets.push({});
        throw new Error("no socket was to be opened");
      },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(closed).toEqual([{ reason: "failed", error: expect.any(ConnectionError) }]);
    expect(closed[0]).toMatchObject({
      error: { message: "The socket could not be opened: its options were not found in time" },
    });
    expect(sockets).toEqual([]);
  });
});
