/**
 * A query a path writes is sent as written, and a `:name` in it is no
 * parameter: a call to such a path keeps every variable — one a closure
 * passes as well, which the query's `:name` took away — a stream asks for no
 * value the query names, and the types ask the variables for none.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, type InferVariables } from "../src/define";

const { endpoint, stream } = courier();
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

interface Seen {
  readonly path: string;
  readonly query: URLSearchParams;
}

/* A server that records each request's path and query, and answers one for `…/events` with a stream. */
async function upstream(): Promise<{ origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://upstream.test");
    seen.push({ path: url.pathname, query: url.searchParams });
    const streams = url.pathname.endsWith("/events");
    res.writeHead(200, { "content-type": streams ? "text/event-stream" : "application/json" });
    res.end(streams ? 'data: {"n":1}\n\nevent: courier:complete\ndata: \n\n' : "{}");
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, seen };
}

const sorted = endpoint.get("items?sort=:field").response<unknown>();
const sortedBy = endpoint
  .variables<{ field: string }>()
  .via((http, vars) => http.get("items?sort=:field", vars))
  .response<unknown>();
const events = stream
  .variables<{ room: string }>()
  .response<unknown>()
  .get(":room/events?since=:start");

function shop(origin: string) {
  return defineApi({ name: "shop", baseURL: origin, endpoints: { sorted, sortedBy, events } });
}

describe("a query a path writes", () => {
  it("is sent as written, and asks the variables for nothing", async () => {
    const { origin, seen } = await upstream();

    await createCaller(shop(origin)).sorted();

    expectTypeOf<InferVariables<typeof sorted>>().toEqualTypeOf<void>();
    expect(seen[0]?.path).toBe("/items");
    expect([...(seen[0]?.query ?? [])]).toEqual([["sort", ":field"]]);
  });

  it("keeps the variable a closure passes under a name the query writes", async () => {
    const { origin, seen } = await upstream();

    await createCaller(shop(origin)).sortedBy({ field: "price" });

    expect([...(seen[0]?.query ?? [])]).toEqual([
      ["sort", ":field"],
      ["field", "price"],
    ]);
  });

  it("asks a stream for no value its query names", async () => {
    const { origin, seen } = await upstream();

    const data: unknown[] = [];
    for await (const event of await createCaller(shop(origin)).events({ room: "lobby" })) {
      data.push(event.data);
    }

    expect(data).toEqual([{ n: 1 }]);
    expect(seen[0]?.path).toBe("/lobby/events");
    expect([...(seen[0]?.query ?? [])]).toEqual([["since", ":start"]]);
  });
});
