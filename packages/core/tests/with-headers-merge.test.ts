/**
 * Headers given to `.with()` at more than one level.
 *
 * Each `.with()` merges into the options of the one before, headers
 * included, so a token set on the client stays when a group adds a request
 * id of its own — on a stream too, whose factory reads the merged `Headers`
 * rather than spreading it: a `Headers` has no own properties to spread.
 */
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";
import type { SSESubscription } from "../src/realtime/types";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint, stream } = courier();
let upstream: Upstream;

function openStream(res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.write("data: 1\n\n");
}

beforeEach(async () => {
  upstream = await startUpstream((request, res) =>
    request.url.startsWith("/feed") || request.url.startsWith("/sse")
      ? openStream(res)
      : echo(request, res),
  );
});

afterEach(async () => {
  await upstream.close();
});

function api() {
  return defineApi({
    expose: true,
    name: "orders",
    baseURL: upstream.url,
    allowedHeaders: ["x-request-id", "x-trace"],
    groups: {
      orders: defineGroup({ prefix: "orders", endpoints: { list: endpoint.get("") } }),
      feed: defineGroup({ prefix: "feed", endpoints: { live: stream.get("live") } }),
    },
  });
}

function client() {
  return createCaller(api());
}

function proxyClient() {
  const source = api();
  return createProxyCaller(routesOf(source, "orders"), {
    proxyPath: { sse: `${upstream.url}/sse` },
  });
}

/** The headers the upstream saw once the stream opened. */
async function openedWith(subscription: SSESubscription<unknown>) {
  try {
    await vi.waitFor(() => expect(upstream.received).toHaveLength(1));
    return upstream.received[0]?.headers;
  } finally {
    subscription.close();
  }
}

describe("headers from chained .with() calls", () => {
  it("are all sent, from the client and the group", async () => {
    await client()
      .with({ headers: { authorization: "Bearer token" } })
      .orders.with({ headers: { "x-request-id": "r1" } })
      .list();

    const headers = upstream.received[0]?.headers;
    expect(headers?.authorization).toBe("Bearer token");
    expect(headers?.["x-request-id"]).toBe("r1");
  });

  it("are all sent when chained on one level", async () => {
    await client()
      .with({ headers: { authorization: "Bearer token" } })
      .with({ headers: { "x-trace": "t1" } })
      .orders.list();

    const headers = upstream.received[0]?.headers;
    expect(headers?.authorization).toBe("Bearer token");
    expect(headers?.["x-trace"]).toBe("t1");
  });

  it("let the later value win for the same header", async () => {
    await client()
      .with({ headers: { authorization: "Bearer first" } })
      .orders.with({ headers: { Authorization: "Bearer second" } })
      .list();

    expect(upstream.received[0]?.headers.authorization).toBe("Bearer second");
  });
});

describe("headers from chained .with() calls on a stream", () => {
  it("are all sent when the stream opens directly", async () => {
    const headers = await openedWith(
      client()
        .with({ headers: { authorization: "Bearer token" } })
        .feed.with({ headers: { "x-request-id": "r1" } })
        .live(),
    );

    expect(headers?.authorization).toBe("Bearer token");
    expect(headers?.["x-request-id"]).toBe("r1");
  });

  it("are all sent when the stream opens through the proxy", async () => {
    const headers = await openedWith(
      proxyClient()
        .with({ headers: { authorization: "Bearer token" } })
        .feed.with({ headers: { "x-request-id": "r1" } })
        .live(),
    );

    expect(headers?.authorization).toBe("Bearer token");
    expect(headers?.["x-request-id"]).toBe("r1");
  });

  it("let the later value win for the same header", async () => {
    const headers = await openedWith(
      client()
        .with({ headers: { authorization: "Bearer first" } })
        .feed.with({ headers: { Authorization: "Bearer second" } })
        .live(),
    );

    expect(headers?.authorization).toBe("Bearer second");
  });

  it("are sent when given as a Headers", async () => {
    const headers = await openedWith(
      proxyClient()
        .with({ headers: new Headers({ authorization: "Bearer token" }) })
        .feed.live(),
    );

    expect(headers?.authorization).toBe("Bearer token");
  });
});
