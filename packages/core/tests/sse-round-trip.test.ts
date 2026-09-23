/**
 * A stream endpoint read back through the Courier SSE client, end to end:
 * the real handler answers the client's own requests.
 *
 * String data used to be written raw while the client parsed every event as
 * JSON, so "hello" was dropped and "42" arrived as a number.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import { buildProxySSEUrl, executeSSE } from "../src/realtime/caller-sse";
import type { SSEEvent } from "../src/realtime/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { stream } = courier();

afterEach(() => {
  _resetSourcesForTests();
  vi.unstubAllGlobals();
});

/** Serve `handler` as `api.live.feed` and route the client's fetches to it. */
function serve(handler: () => AsyncGenerator<SSEEvent<unknown>, void, unknown>): string {
  const feed = stream.response<unknown>().implement(handler as never);
  registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as never);
  const { handleSSE } = createHandler();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => handleSSE(new Request(url, init)));
  return buildProxySSEUrl("http://localhost/api/sse", "api", "live", "feed");
}

async function readFor(url: string, ms: number): Promise<unknown[]> {
  const sub = executeSSE<unknown>(url);
  const seen: unknown[] = [];
  const reading = (async () => {
    for await (const event of sub) seen.push(event.data);
  })();
  await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, ms))]);
  sub.close();
  return seen;
}

describe("data sent by a stream endpoint", () => {
  it("arrives as sent, strings included", async () => {
    const sent = ["hello", "42", "true", "line one\nline two", 7, { a: [1, null] }, null];
    const url = serve(async function* () {
      for (const data of sent) yield { data };
    });

    const seen = await readFor(url, 50);

    expect(seen.slice(0, sent.length)).toEqual(sent);
  });
});
