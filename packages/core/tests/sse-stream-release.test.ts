/**
 * SSE streams that must end without their generator's help.
 *
 * A generator waiting on an event that never came held its stream open, so
 * shutdown never finished — under Docker or Kubernetes a SIGTERM hung until
 * SIGKILL. A client that stopped reading had every broadcast queued for it,
 * each reported delivered, while memory grew without bound.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { LIMITS } from "../src/adapter/limits";
import { courier } from "../src/define/courier";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { stream } = courier();

afterEach(() => {
  _resetSourcesForTests();
});

function sseRequest(): Request {
  return new Request("http://app.localhost/api/sse?_s=api&_m=feed", {
    headers: { accept: "text/event-stream" },
  });
}

describe("a generator parked on an event that never comes", () => {
  it("does not hold up shutdown", async () => {
    const feed = stream.response<string>().implement(async function* () {
      yield { data: "hello" };
      await new Promise(() => {});
    });
    registerSources({ api: { options: {}, feed } } as never);
    const handler = createHandler();
    const response = await handler.handleSSE(sseRequest());
    await response.body?.getReader().read();

    const started = Date.now();
    await handler.shutdownSSE({ drainMs: 200 });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(handler.sseConnections.count).toBe(0);
  });

  it("is let go when disconnected, and its finally runs the next time it yields", async () => {
    let released = false;
    let wake: () => void = () => {};
    const feed = stream.response<string>().implement(async function* () {
      try {
        yield { data: "hello" };
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        yield { data: "late" };
      } finally {
        released = true;
      }
    });
    registerSources({ api: { options: {}, feed } } as never);
    const handler = createHandler();
    await (await handler.handleSSE(sseRequest())).body?.getReader().read();

    const [connection] = handler.sseConnections.list();
    handler.sseConnections.disconnect(connection?.connectionId ?? "");
    await expect.poll(() => handler.sseConnections.count).toBe(0);
    wake();

    await expect.poll(() => released).toBe(true);
  });
});

describe("a client that stops reading", () => {
  it("has broadcasts refused, and is closed as a slow consumer", async () => {
    const reasons: string[] = [];
    const feed = stream.response<string>().implement(async function* (ctx) {
      yield { data: "hello" };
      await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
    });
    registerSources({ api: { options: {}, feed } } as never);
    const handler = createHandler({ onSSEDisconnect: ({ reason }) => { reasons.push(reason); } });
    await handler.handleSSE(sseRequest());

    const big = "x".repeat(LIMITS.SSE_MAX_BUFFERED_BYTES);
    const results = Array.from({ length: LIMITS.MAX_CONSECUTIVE_DROPS + 2 }, () =>
      [...handler.sseConnections.broadcastAll({ data: big }).values()][0],
    );

    expect(results.filter((ok) => ok === false).length).toBeGreaterThan(0);
    await expect.poll(() => reasons).toEqual(["slow_consumer"]);
  });
});
