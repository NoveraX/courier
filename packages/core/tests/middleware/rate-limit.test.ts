import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineMiddleware, rateLimitMiddleware } from "../../src/middleware/index";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();

/* A call's release is recorded by the next middleware, a moment after the
   limiter lets it through — a few milliseconds on a busy machine — so two
   recorded releases can sit that much closer together than the admissions
   themselves. A limiter that let a call through early would be out by most
   of a window. */
const RECORD_SLACK_MS = 10;

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/** A client whose requests pass the limiter, then record when they were let through. */
async function limitedClient(limit: { maxRequests: number; window: number }, released: number[]) {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
  return createCaller(
    defineApi({
      name: "api",
      baseURL: upstream.url,
      middleware: [
        rateLimitMiddleware(limit),
        defineMiddleware("released", "before", () => {
          released.push(performance.now());
        }),
      ],
      endpoints: { read: endpoint.get("items") },
    }),
  );
}

/* A call the upstream tells apart from the others, so none of them is shared with another in flight. */
function distinct<
  TClient extends { with: (options: { headers: Record<string, string> }) => TClient },
>(client: TClient, n: number): TClient {
  return client.with({ headers: { "x-call": String(n) } });
}

/** Run nothing else for `ms` milliseconds, as a CPU-bound handler would. */
function blockEventLoop(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* The spinning is the load. */
  }
}

describe("rateLimitMiddleware", () => {
  it("lets no more than the limit through in any window when calls arrive together", async () => {
    const released: number[] = [];
    const client = await limitedClient({ maxRequests: 2, window: 300 }, released);
    const started = performance.now();

    await Promise.all(Array.from({ length: 6 }, (_, n) => distinct(client, n).read()));

    /* The first window's calls are let through while the burst is still being
       started, and recorded only after it: a busy machine records them late,
       never early. So each call is held to the earliest its window allows,
       counted from the burst's start — two in the first 300 ms, two more from
       300 ms, the last two from 600 ms. */
    const sorted = released.toSorted((a, b) => a - b);
    const early = sorted.filter((at, n) => at - started < Math.floor(n / 2) * 300);
    expect(early).toEqual([]);
    expect(upstream?.seen).toHaveLength(6);
  });

  it("spreads a burst over as many windows as it needs", async () => {
    const released: number[] = [];
    const client = await limitedClient({ maxRequests: 2, window: 200 }, released);
    const started = performance.now();

    await Promise.all(Array.from({ length: 5 }, () => client.read()));

    const offsets = released.map((at) => at - started).toSorted((a, b) => a - b);
    expect(offsets.filter((at) => at < 200 - RECORD_SLACK_MS)).toHaveLength(2);
    expect(offsets.filter((at) => at >= 400 - RECORD_SLACK_MS)).toHaveLength(1);
  });

  it("lets calls through at once while the window has room", async () => {
    const released: number[] = [];
    const client = await limitedClient({ maxRequests: 3, window: 1000 }, released);
    const started = performance.now();

    await Promise.all([client.read(), client.read(), client.read()]);

    expect(released.every((at) => at - started < 200)).toBe(true);
  });

  it("stops holding a queued call when its caller cancels", async () => {
    const released: number[] = [];
    const client = await limitedClient({ maxRequests: 1, window: 5000 }, released);
    await client.read();
    const controller = new AbortController();
    const started = performance.now();
    setTimeout(() => controller.abort(), 50);

    await expect(client.with({ signal: controller.signal }).read()).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(performance.now() - started).toBeLessThan(1000);
    expect(released).toHaveLength(1);
    expect(upstream?.seen).toHaveLength(1);
  });

  it("gives a cancelled caller's turn to the call queued behind it", async () => {
    const released: number[] = [];
    const client = await limitedClient({ maxRequests: 1, window: 300 }, released);
    const started = performance.now();
    const first = client.read();
    const controller = new AbortController();
    const cancelled = client.with({ signal: controller.signal }).read();
    const behind = client.read();
    setTimeout(() => controller.abort(), 50);

    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await Promise.all([first, behind]);

    /* The first call is let through while the others are still being
       started, and recorded after that; the one behind it, a window later,
       is counted from the start, which its record can only come after. */
    const behindAt = (released[1] ?? 0) - started;
    expect(released).toHaveLength(2);
    expect(behindAt).toBeGreaterThanOrEqual(300);
    expect(behindAt).toBeLessThan(450);
    expect(upstream?.seen).toHaveLength(2);
  });

  it("holds the limit when a busy event loop runs the queue's timers late", async () => {
    const released: number[] = [];
    const client = await limitedClient({ maxRequests: 1, window: 100 }, released);
    setTimeout(() => blockEventLoop(250), 50);

    await Promise.all(Array.from({ length: 3 }, () => client.read()));

    const sorted = released.toSorted((a, b) => a - b);
    const gaps = sorted.slice(1).map((at, i) => at - (sorted[i] ?? 0));
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap >= 100 - RECORD_SLACK_MS)).toBe(true);
    expect(upstream?.seen).toHaveLength(3);
  });
});
