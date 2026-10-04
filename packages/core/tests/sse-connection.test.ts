/**
 * How an SSE subscription treats a connection that stops delivering.
 *
 * A server that falls silent for longer than `heartbeatTimeout` drops the
 * connection, not the subscription, which reconnects rather than ending as
 * though the server had finished it; and only attempts in a row that deliver
 * nothing count towards `maxAttempts`, so a long-lived stream survives its
 * Nth drop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionError } from "../src/realtime/errors";
import { subscribeSSE } from "../src/realtime/sse/sse-client";

const encoder = new TextEncoder();
const FAST = { initialMs: 5, maxMs: 5 };

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A response that sends `body`, then either ends or stays open until aborted. */
function stream(body: string, init: RequestInit | undefined, stayOpen: boolean): Response {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      if (!stayOpen) {
        controller.close();
        return;
      }
      init?.signal?.addEventListener("abort", () =>
        controller.error(new DOMException("The operation was aborted.", "AbortError")),
      );
    },
  });
  return new Response(readable, { headers: { "Content-Type": "text/event-stream" } });
}

async function readFor<TData>(sub: AsyncIterable<{ data: TData }>, ms: number): Promise<TData[]> {
  const seen: TData[] = [];
  const reading = (async () => {
    for await (const event of sub) seen.push(event.data);
  })();
  await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, ms))]);
  return seen;
}

/** Read until `done` says enough has arrived, or `ms` passes, whichever comes first. */
async function readUntil<TData>(
  sub: AsyncIterable<{ data: TData }>,
  done: (seen: TData[]) => boolean,
  ms: number,
): Promise<TData[]> {
  const seen: TData[] = [];
  const reading = (async () => {
    for await (const event of sub) {
      seen.push(event.data);
      if (done(seen)) return;
    }
  })();
  await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, ms))]);
  return seen;
}

describe("a server that falls silent", () => {
  it("is reconnected once heartbeatTimeout passes, and the stream goes on", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) =>
        stream("data: 1\n\n", init, true),
      )
      .mockImplementation((_url: string, init?: RequestInit) => stream("data: 2\n\n", init, true));
    vi.stubGlobal("fetch", fetchMock);
    const sub = subscribeSSE<number>("/sse", { heartbeatTimeout: 30, backoff: FAST });
    const statuses: string[] = [];
    sub.on("status", (status) => statuses.push(status));

    /* Waits for the second event rather than a fixed time, so a busy machine
       that runs the timers late still sees the reconnect. */
    const seen = await readUntil(sub, (events) => events.length >= 2, 5_000);
    sub.close();

    expect(seen.slice(0, 2)).toEqual([1, 2]);
    expect(statuses).toContain("reconnecting");
  });

  it("stays open while the server keeps sending comments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const readable = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("data: 1\n\n"));
            const beat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 10);
            init?.signal?.addEventListener("abort", () => {
              clearInterval(beat);
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        });
        return new Response(readable, { headers: { "Content-Type": "text/event-stream" } });
      }),
    );
    /* Comments every 10 ms against a 250 ms timeout: only a stall far beyond
       any scheduling delay would let the timeout pass. */
    const sub = subscribeSSE<number>("/sse", { heartbeatTimeout: 250, backoff: FAST });
    const statuses: string[] = [];
    sub.on("status", (status) => statuses.push(status));

    await readFor(sub, 400);
    sub.close();

    expect(statuses).not.toContain("reconnecting");
  });
});

describe("maxAttempts", () => {
  it("counts only failures in a row, not drops after a connection that delivered", async () => {
    let served = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        served += 1;
        if (served <= 3) return stream(`data: ${served}\n\n`, init, false);
        throw new TypeError("Failed to fetch");
      }),
    );
    const sub = subscribeSSE<number>("/sse", { maxAttempts: 2, backoff: FAST });
    const seen: number[] = [];

    const reading = (async () => {
      for await (const event of sub) seen.push(event.data);
    })();

    await expect(reading).rejects.toBeInstanceOf(ConnectionError);
    expect(seen).toEqual([1, 2, 3]);
    expect(served).toBe(5);
  });
});
