/**
 * @vitest-environment jsdom
 *
 * An SSE subscription reconnects on the rules a socket does. Its backoff
 * starts over only after a connection stayed open, so a server that ends
 * every stream at once is called back less and less often; it waits no less
 * than its server asks, and no more than five minutes for it; a 401 is tried
 * once more when the credentials asked for anew have changed; and the page's
 * signals bring back a stream that waits to reconnect, or that a sleep left
 * silent — though not before a wait its server asked for, the failures in a
 * row still counted. The streams here are the test's own, under fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "../src/realtime/errors";
import { retryOf } from "../src/realtime/retry-of";
import { subscribeSSE } from "../src/realtime/sse/sse-client";
import type { SubscribeSSEOptions } from "../src/realtime/sse/sse-types";
import type { Subscription } from "../src/realtime/subscription-types";

const URL = "https://api.example.com/sse/live";
const encoder = new TextEncoder();
/* Waits as the exponent gives them, so each can be told apart. */
const EXACT = { initialMs: 100, factor: 2, maxMs: 100_000, jitter: false };

/** One connection the test serves: what it was opened with, and what the test makes it say. */
interface Served {
  readonly headers: Record<string, string>;
  say(text: string): void;
  end(): void;
}

let served: Served[] = [];
let subscriptions: Subscription<unknown>[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  served = [];
});

afterEach(() => {
  for (const subscription of subscriptions) subscription.close();
  subscriptions = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* Each call answers with `refuse(call)`, a status and its headers, or with a stream the test drives. */
function stubFetch(refuse: (call: number) => ResponseInit | undefined = () => undefined) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const refusal = refuse(fetch.mock.calls.length - 1);
    if (refusal) return new Response(null, refusal);
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start: (opened) => {
        controller = opened;
      },
    });
    init?.signal?.addEventListener("abort", () => {
      try {
        controller?.error(new DOMException("The operation was aborted.", "AbortError"));
      } catch {
        /* Already ended. */
      }
    });
    served.push({
      headers: Object.fromEntries(new Headers(init?.headers)),
      say: (text) => controller?.enqueue(encoder.encode(text)),
      end: () => controller?.close(),
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function open(options: SubscribeSSEOptions = {}): Subscription<unknown> {
  const subscription = subscribeSSE(URL, { backoff: EXACT, ...options });
  subscriptions.push(subscription);
  return subscription;
}

/** The waits the subscription said it would take, as each reconnect began. */
function waitsOf(subscription: Subscription<unknown>): number[] {
  const waits: number[] = [];
  subscription.on("status", (status) => {
    if (status === "reconnecting") waits.push(retryOf(subscription)?.retryIn ?? -1);
  });
  return waits;
}

/* What fetch, the stream and the loop do between two of the test's steps. */
async function settled(): Promise<void> {
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);
}

async function waitOut(waits: number[]): Promise<void> {
  await vi.advanceTimersByTimeAsync(waits.at(-1) ?? 0);
  await settled();
}

describe("the backoff", () => {
  it("starts over only after a connection stayed open 10 s", async () => {
    stubFetch();
    const subscription = open();
    const waits = waitsOf(subscription);
    await settled();

    for (let i = 0; i < 3; i++) {
      served.at(-1)?.say("data: 1\n\n");
      served.at(-1)?.end();
      await settled();
      await waitOut(waits);
    }
    await vi.advanceTimersByTimeAsync(10_000);
    served.at(-1)?.end();
    await settled();

    expect(waits).toEqual([100, 200, 400, 100]);
  });

  it("waits no less than the stream's retry: asks, and no more than five minutes", async () => {
    stubFetch();
    const subscription = open();
    const waits = waitsOf(subscription);
    await settled();

    served[0]?.say("retry: 5000\ndata: 1\n\n");
    served[0]?.end();
    await settled();
    await waitOut(waits);
    served[1]?.say("retry: 999999999\ndata: 2\n\n");
    served[1]?.end();
    await settled();

    expect(waits).toEqual([5_100, 300_200]);
  });

  it("waits no less than the Retry-After of a 503", async () => {
    stubFetch((call) =>
      call === 0 ? { status: 503, headers: { "Retry-After": "2" } } : undefined,
    );
    const subscription = open();
    const waits = waitsOf(subscription);

    await settled();

    expect(waits).toEqual([2_100]);
  });
});

describe("a stream refused with 401", () => {
  const tokens = (...given: string[]) => {
    const left = [...given];
    return () => ({ headers: { Authorization: `Bearer ${left.shift() ?? given.at(-1)}` } });
  };

  it("is opened once more at once with the credentials asked for anew", async () => {
    const fetch = stubFetch((call) => (call === 0 ? { status: 401 } : undefined));
    const subscription = open({ beforeConnect: tokens("t1", "t2") });

    await settled();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(served[0]?.headers.authorization).toBe("Bearer t2");
    expect(subscription.status).toBe("connected");
  });

  it("ends with the AuthError, the same credentials not sent again", async () => {
    const fetch = stubFetch(() => ({ status: 401 }));
    const subscription = open({ beforeConnect: tokens("t1") });
    const ended = subscription[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error);

    await settled();

    expect(await ended).toBeInstanceOf(AuthError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is tried once: a second 401 ends it, whatever the credentials", async () => {
    const fetch = stubFetch(() => ({ status: 401 }));
    const subscription = open({ beforeConnect: tokens("t1", "t2", "t3") });
    const ended = subscription[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown) => error);

    await settled();

    expect(await ended).toBeInstanceOf(AuthError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gets its attempt again once a stream was accepted since", async () => {
    let calls = 0;
    const fetch = stubFetch((call) => {
      calls = call;
      return call === 0 || call === 2 ? { status: 401 } : undefined;
    });
    const subscription = open({ beforeConnect: tokens("t1", "t2", "t3", "t4") });
    await settled();

    served[0]?.end();
    await settled();
    await vi.advanceTimersByTimeAsync(100);
    await settled();

    expect([calls, fetch.mock.calls.length, subscription.status]).toEqual([3, 4, "connected"]);
  });
});

describe("the page's signals", () => {
  const signal = (type: string) => window.dispatchEvent(new Event(type));

  it("bring a stream waiting to reconnect back at once", async () => {
    stubFetch();
    const subscription = open({ backoff: { initialMs: 60_000, jitter: false } });
    await settled();
    served[0]?.end();
    await settled();

    signal("focus");
    await settled();

    expect([served.length, subscription.status]).toEqual([2, "connected"]);
  });

  it("keep the wait a 429's Retry-After asked for", async () => {
    const fetch = stubFetch((call) =>
      call === 0 ? { status: 429, headers: { "Retry-After": "30" } } : undefined,
    );
    open();
    await settled();
    await vi.advanceTimersByTimeAsync(1_500);

    signal("focus");
    await vi.advanceTimersByTimeAsync(28_499);
    await settled();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(101);
    await settled();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keep that wait when the network comes back, the refusals in a row counted", async () => {
    const fetch = stubFetch((call) =>
      call < 2 ? { status: 429, headers: { "Retry-After": "30" } } : undefined,
    );
    const subscription = open();
    const waits = waitsOf(subscription);
    await settled();

    signal("online");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(101);
    await settled();

    expect(waits, "the second refusal waits 30 s and 200 ms").toEqual([30_100, 30_200]);
  });

  it("open again a stream a sleep left silent, and leave one heard from lately", async () => {
    stubFetch();
    open({ heartbeatTimeout: 45_000 });
    await settled();
    served[0]?.say(": ping\n\n");
    await settled();

    signal("focus");
    await settled();
    const lately = served.length;
    /* The computer slept: its clock moved on, and no timer ran meanwhile. */
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(1_000);
    signal("focus");
    await settled();

    expect([lately, served.length]).toEqual([1, 2]);
  });

  it("leave the stream as it is with reconnectOnResume: false", async () => {
    stubFetch();
    const subscription = open({
      backoff: { initialMs: 60_000, jitter: false },
      reconnectOnResume: false,
    });
    await settled();
    served[0]?.end();
    await settled();

    signal("focus");
    await settled();

    expect([served.length, subscription.status]).toEqual([1, "reconnecting"]);
  });

  it("are no longer listened for once its last stream is closed", async () => {
    stubFetch();
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const streams = [open(), open(), open()];
    await settled();

    for (const stream of streams) stream.close();
    const count = (spy: typeof added, type: string) =>
      spy.mock.calls.filter(([name]) => name === type).length;

    expect([count(added, "focus"), count(removed, "focus")]).toEqual([1, 1]);
  });
});
