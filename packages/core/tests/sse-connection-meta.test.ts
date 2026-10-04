import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { stream } = courier();
const STREAM_URL = "http://127.0.0.1/api/sse?_s=api&_m=feed";

afterEach(() => {
  vi.restoreAllMocks();
  _resetSourcesForTests();
});

function serveFeed(): void {
  const feed = stream.response<number>().implement(async function* () {
    yield { data: 1 };
  });
  registerSources({ api: { options: { groups: {} }, feed } } as never);
}

/**
 * The metadata an SSE stream carries is what `onSSEConnect` returned, and the
 * other SSE hooks are typed from that return. One that hands back anything
 * but an object, or nothing, is refused as a throw from it is; one that
 * returns nothing gives the stream no fields, not `undefined`.
 */
describe("the metadata the SSE hooks receive", () => {
  it("is typed from what onSSEConnect returns", () => {
    const handler = createHandler({
      onSSEConnect: async () => ({ userId: "u1" }),
      onSSEDisconnect: ({ meta }) => {
        const userId: string = meta.userId;
        expect(userId).toBeTypeOf("string");
      },
      onSSEError: ({ meta }) => {
        const userId: string = meta.userId;
        expect(userId).toBeTypeOf("string");
      },
    });

    expect(handler.sseConnections.count).toBe(0);
  });

  it("has no fields where onSSEConnect returns nothing", async () => {
    serveFeed();
    const seen: unknown[] = [];
    const handler = createHandler({
      onSSEConnect: () => undefined,
      onSSEDisconnect: ({ meta }) => {
        const absent: undefined = meta.userId;
        seen.push(meta, absent);
      },
    });

    const response = await handler.handleSSE(new Request(STREAM_URL));
    await response.text();
    await vi.waitFor(() => expect(seen).toHaveLength(2));

    expect(seen).toEqual([{}, undefined]);
  });

  it("refuses a stream whose onSSEConnect returns something other than an object", async () => {
    serveFeed();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = createHandler({
      // @ts-expect-error — a JavaScript application may return anything
      onSSEConnect: () => "user-1",
    });

    const response = await handler.handleSSE(new Request(STREAM_URL));

    expect(response.status).toBe(403);
    const causes = warn.mock.calls.map((call) => String(call[2]));
    expect(causes.some((cause) => cause.includes("onSSEConnect returned a string"))).toBe(true);
  });
});
