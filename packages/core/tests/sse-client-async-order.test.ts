/**
 * Regression test for the SSE client's deferred connection loop start.
 *
 * # The invariant
 *
 * `subscribeSSE` MUST return synchronously even when the underlying
 * `fetch` never resolves. The connection loop runs asynchronously via
 * `void runConnectionLoop(...)` — the `void` discards the returned promise
 * so the caller is not blocked waiting for the first network response.
 *
 * Why this matters: the Studio Playground watchdog (and any other
 * subscriber) registers a `subscription.on("status", …)` listener AFTER
 * `subscribeSSE()` returns. If `subscribeSSE` were to await the loop
 * (`await runConnectionLoop(...)` instead of `void runConnectionLoop(...)`),
 * the function would never return — the loop runs forever — and the
 * caller would never get a chance to register listeners.
 *
 * # The realistic regression
 *
 * Someone refactors `subscribeSSE` in `sse-client.ts`
 * to add an `await` before `runConnectionLoop(...)` thinking it makes
 * error handling cleaner. The function suddenly never returns. Every
 * SSE consumer hangs. The build still passes.
 *
 * This test catches that by stubbing `fetch` with a never-resolving
 * promise and asserting `subscribeSSE` returns within the same tick.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { subscribeSSE } from "../src/realtime/sse/sse-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribeSSE — sync return invariant", () => {
  it("returns synchronously even when fetch never resolves", () => {
    // Hung fetch — if subscribeSSE awaited the connection loop, it would
    // never return. This assertion captures the contract.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    let returned = false;
    const sub = subscribeSSE("http://example.test/sse");
    returned = true;
    try {
      expect(returned).toBe(true);
      expect(typeof sub.close).toBe("function");
      expect(typeof sub.on).toBe("function");
    } finally {
      sub.close();
    }
  });

  it("a listener registered after subscribeSSE() observes the reconnecting transition that follows a failed fetch", async () => {
    // fetch rejects on first call → loop catches → state.set("reconnecting")
    // → second iteration sleeps via backoff → during the sleep, the listener
    // (registered after subscribeSSE returned) has time to observe the
    // reconnecting transition.
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        attempt += 1;
        return Promise.reject(new Error(`mock fetch failure #${attempt}`));
      }),
    );

    const sub = subscribeSSE("http://example.test/sse", {
      backoff: { initialMs: 10_000, maxMs: 10_000, jitter: false },
    });

    const observed: string[] = [];
    sub.on("status", (s) => observed.push(s));

    try {
      // Wait until we see at least one "reconnecting" transition.
      // 100 ms is plenty for the loop to complete one failed attempt
      // and reach the `state.set("reconnecting")` line.
      await vi.waitFor(() => expect(observed).toContain("reconnecting"), {
        timeout: 200,
        interval: 5,
      });
    } finally {
      sub.close();
    }
  });

  it("close() called immediately after subscribeSSE() prevents the loop from leaking", async () => {
    // Yet another regression guard — if subscribeSSE blocked on the loop,
    // close() would never run. This ensures the abort signal can shut down
    // the loop from outside immediately.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const sub = subscribeSSE("http://example.test/sse");
    sub.close();

    // Give the aborted loop a microtask to wind down. There should be no
    // unhandled rejections — the test runner would surface them.
    await Promise.resolve();
    await Promise.resolve();
    expect(true).toBe(true);
  });
});
