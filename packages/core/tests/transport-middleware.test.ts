/**
 * SSE, WebSocket and the in-process streams share one middleware runner.
 *
 * Each runs the source's middleware and then the endpoint's own, as HTTP
 * does, so an endpoint's guard holds on exactly the long-lived transports
 * where it matters. The cases below pin both halves of the chain and the
 * order between them.
 */
import { describe, expect, it, vi } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define/index";
import type { Middleware } from "../src/middleware/types";
import { runTransportMiddleware } from "../src/utils/transport-middleware";

const { endpoint } = courier();

/** A `before` middleware that records the order it ran in. */
function recorder(name: string, into: string[]): Middleware {
  return {
    name,
    phase: "before",
    handler: vi.fn(async () => {
      into.push(name);
    }),
  };
}

/** A `before` middleware that stamps a header the endpoint should receive. */
function stamper(header: string, value: string): Middleware {
  return {
    name: `stamp-${header}`,
    phase: "before",
    handler: vi.fn(async (ctx: { headers: Headers }) => {
      ctx.headers.set(header, value);
    }),
  };
}

function run(sources: Record<string, unknown>, timeoutMs?: number) {
  return runTransportMiddleware({
    transport: "sse",
    sources: sources as never,
    source: "api",
    group: "users",
    method: "feed",
    variables: { id: 1 },
    request: new Request("https://app.example.com/api/sse"),
    requestId: "rid-1",
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

/** A source whose `feed` endpoint carries the given endpoint-level middleware. */
function sourcesWith(options: {
  source?: Middleware[];
  endpointLevel?: Middleware[];
}): Record<string, unknown> {
  let feed = endpoint.get("feed") as { use(middleware: Middleware): typeof feed };
  for (const middleware of options.endpointLevel ?? []) {
    feed = feed.use(middleware);
  }

  return {
    api: defineApi({
      baseURL: "https://upstream.example",
      ...(options.source?.length ? { middleware: options.source } : {}),
      groups: {
        users: defineGroup({ prefix: "users", endpoints: { feed: feed as never } }),
      },
    }),
  };
}

describe("runTransportMiddleware", () => {
  it("does nothing when neither the source nor the endpoint declares any", async () => {
    await expect(run(sourcesWith({}))).resolves.toBeInstanceOf(Headers);
  });

  it("runs the middleware declared on the source", async () => {
    const order: string[] = [];

    await run(sourcesWith({ source: [recorder("source", order)] }));

    expect(order).toEqual(["source"]);
  });

  it("runs the middleware declared on the endpoint", async () => {
    const order: string[] = [];

    await run(sourcesWith({ endpointLevel: [recorder("endpoint", order)] }));

    expect(order).toEqual(["endpoint"]);
  });

  it("runs the source's middleware outside the endpoint's own", async () => {
    const order: string[] = [];

    await run(
      sourcesWith({
        source: [recorder("source", order)],
        endpointLevel: [recorder("endpoint", order)],
      }),
    );

    expect(order).toEqual(["source", "endpoint"]);
  });

  it("returns the headers the chain assembled", async () => {
    const headers = await run(sourcesWith({ source: [stamper("x-tenant", "acme")] }));

    expect(headers.get("x-tenant")).toBe("acme");
  });

  it("carries a header an endpoint's own middleware set", async () => {
    const headers = await run(sourcesWith({ endpointLevel: [stamper("x-scope", "read")] }));

    expect(headers.get("x-scope")).toBe("read");
  });

  it("rejects when the chain outruns its deadline, naming the transport", async () => {
    const stalled: Middleware = {
      name: "stalled",
      phase: "before",
      handler: () => new Promise(() => {}),
    };

    await expect(run(sourcesWith({ source: [stalled] }), 50)).rejects.toThrow(
      "sse middleware timeout (50ms)",
    );
  });

  it("propagates a rejection so the caller can refuse the stream", async () => {
    const denying: Middleware = {
      name: "denying",
      phase: "before",
      handler: async () => {
        throw new Error("not authorized");
      },
    };

    await expect(run(sourcesWith({ source: [denying] }))).rejects.toThrow("not authorized");
  });
});
