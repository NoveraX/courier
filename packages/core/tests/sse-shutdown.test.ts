/**
 * A stream open while its server shuts down gracefully, read by Courier's
 * own client, which then reconnects to the server that replaces it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { type AdapterHandler, createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import { buildProxySSEUrl } from "../src/realtime/caller-sse";
import { subscribeSSE } from "../src/realtime/sse/sse-client";
import { type SSEContext, tracked } from "../src/realtime/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

afterEach(() => {
  _resetSourcesForTests();
  vi.unstubAllGlobals();
});

/** Serve a feed of `evt-N` events, resuming after the id it is given. */
function serveTrackedFeed(resumedFrom: (string | undefined)[]): void {
  const feed = courier()
    .stream.response<{ n: number }>()
    .implement(async function* (ctx: SSEContext) {
      resumedFrom.push(ctx.lastEventId);
      let n = ctx.lastEventId ? Number(ctx.lastEventId.slice("evt-".length)) : 0;
      while (!ctx.signal.aborted) {
        n += 1;
        yield tracked(`evt-${n}`, { n });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
  registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as never);
}

describe("a stream open while its server shuts down", () => {
  it("resumes on the next server after the last event the stream sent", async () => {
    const resumedFrom: (string | undefined)[] = [];
    serveTrackedFeed(resumedFrom);
    let server: AdapterHandler = createHandler();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      server.handleSSE(new Request(url, init)),
    );
    const url = buildProxySSEUrl("http://localhost/api/sse", "api", "live", "feed");
    const seen: { id?: string; event?: string; data: unknown }[] = [];
    const subscription = subscribeSSE<{ n: number }>(url);
    const reading = (async () => {
      for await (const event of subscription) seen.push(event);
    })();

    await expect.poll(() => seen.length).toBeGreaterThanOrEqual(3);
    const stopping = server;
    server = createHandler();
    await stopping.shutdownSSE({ retryMs: 10, drainMs: 50 });
    await expect.poll(() => resumedFrom.length, { timeout: 2000 }).toBe(2);
    subscription.close();
    await reading;

    expect(seen.every((event) => event.event === undefined)).toBe(true);
    expect(seen.map((event) => event.id)).toEqual(seen.map((_event, index) => `evt-${index + 1}`));
    expect(resumedFrom[1]).toMatch(/^evt-\d+$/);
  });
});
