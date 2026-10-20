/**
 * Calls that miss the cache together: a burst on an empty or expired entry
 * reaches the API once, not once per call, and every call gets a copy of
 * its own. A call that stops waiting leaves at once; one whose answer the
 * cache would not keep — a failure — is no answer for the others, which
 * make calls of their own.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { cacheMiddleware } from "../../src/middleware/index";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

function clientFor(url: string) {
  return createCaller(
    defineApi({
      name: "api",
      baseURL: url,
      middleware: [cacheMiddleware({ scope: "public", ttl: 60_000 })],
      endpoints: { prices: endpoint.get("prices").response<{ n: number; list: string[] }>() },
    }),
  );
}

/* Calls the transport would send apart — each its own header — so only the cache can join them. */
function burst(client: ReturnType<typeof clientFor>, count: number, signals: AbortSignal[] = []) {
  return Array.from({ length: count }, (_, n) =>
    client.with({ headers: { "x-call": String(n) }, signal: signals[n] }).prices(),
  );
}

describe("calls that miss the cache together", () => {
  it("reach the API once, and each gets a copy of its own", async () => {
    upstream = await startUpstream((_req, res, index) => {
      setTimeout(() => sendJson(res, 200, { n: index + 1, list: ["a"] }), 50);
    });
    const client = clientFor(upstream.url);

    const answers = await Promise.all(burst(client, 5));

    expect(upstream.seen).toHaveLength(1);
    expect(answers.every((answer) => answer.n === 1)).toBe(true);
    answers[0]?.list.push("edited");
    expect(answers[1]?.list).toEqual(["a"]);
  });

  it("let one that stops waiting leave at once, and the others go on", async () => {
    /* The upstream holds its answer until the test lets it go, so a call that leaves cannot have waited for it. */
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached = (): void => {};
    const arrived = new Promise<void>((resolve) => {
      reached = resolve;
    });
    upstream = await startUpstream((_req, res, index) => {
      reached();
      void held.then(() => sendJson(res, 200, { n: index + 1, list: [] }));
    });
    const client = clientFor(upstream.url);
    const leaving = new AbortController();
    const [first, second] = burst(client, 2, [new AbortController().signal, leaving.signal]);
    if (first === undefined || second === undefined) throw new Error("the burst made fewer calls");

    await arrived;
    await new Promise((resolve) => setImmediate(resolve));
    leaving.abort();

    try {
      /* Far longer than leaving takes: it bounds only a call that waits for the held answer. */
      const left = await Promise.race([
        second.then(
          () => "answered",
          (error: unknown) => error,
        ),
        new Promise((resolve) => setTimeout(() => resolve("still waiting"), 2_000)),
      ]);
      expect(left).toMatchObject({ name: "AbortError" });
    } finally {
      release();
    }
    await expect(first).resolves.toMatchObject({ n: 1 });
    expect(upstream.seen).toHaveLength(1);
  });

  it("make calls of their own when the first one's answer is not kept", async () => {
    upstream = await startUpstream((_req, res, index) => {
      setTimeout(() => sendJson(res, index === 0 ? 503 : 200, { n: index + 1, list: [] }), 50);
    });
    const client = clientFor(upstream.url);

    const settled = await Promise.allSettled(burst(client, 3));

    expect(settled[0]?.status).toBe("rejected");
    expect(settled.slice(1).map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(upstream.seen).toHaveLength(3);
  });
});
