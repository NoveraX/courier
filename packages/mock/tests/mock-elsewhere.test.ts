/**
 * A mock that answers only some endpoints, or answers with recordings of
 * the source's own server, against a real one: an endpoint it does not
 * name goes to the server as the app calls it — credentials and all — and
 * the server's answer, failure included, comes back as it was; recordings
 * are made the first time a call is asked and answer it from then on, even
 * with the server gone; a call with neither is a 502 that says why; and a
 * mock naming an endpoint its source does not have does not start.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { MockEndpointsError } from "../src/auto/mock-endpoints-error";

const { endpoint } = courier();

let upstream: Server;
let upstreamUrl: string;
let calls: string[];
let dir: string;

function answer(req: IncomingMessage, res: ServerResponse): void {
  calls.push(`${req.method} ${req.url}`);
  const [status, body] = reply(req);
  res.writeHead(status, { "content-type": "application/json", "x-upstream": "yes" });
  res.end(JSON.stringify(body));
}

function reply(req: IncomingMessage): [number, unknown] {
  if (req.url === "/users") {
    return [200, [{ id: 1, name: "Ann", auth: req.headers.authorization ?? null }]];
  }
  if (req.url === "/users/1") return [200, { id: 1, name: "Ann" }];
  if (req.url?.startsWith("/users/")) return [404, { error: "no such user" }];
  return [500, { error: `unexpected ${req.method} ${req.url}` }];
}

function api(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          list: endpoint.get("").response<Array<{ id: number; name: string }>>(),
          get: endpoint
            .get(":id")
            .variables<{ id: number }>()
            .response<{ id: number; name: string }>(),
        },
      }),
      orders: defineGroup({
        prefix: "orders",
        endpoints: {
          refund: endpoint
            .post(":id/refund")
            .variables<{ id: number }>()
            .response<{ id: number }>(),
        },
      }),
    },
  });
}

beforeEach(async () => {
  calls = [];
  dir = mkdtempSync(join(tmpdir(), "courier-mock-elsewhere-"));
  upstream = createServer(answer);
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe("a mock that answers only some endpoints", () => {
  it("passes the others to the source's server, with the request's credentials", async () => {
    const mock = createAutoMockServer({
      source: api(upstreamUrl),
      endpoints: ["orders.refund"],
      log: false,
    });

    const list = await mock.app.request("/users", { headers: { authorization: "Bearer t-1" } });
    const refund = await mock.app.request("/orders/5/refund", { method: "POST", body: "{}" });

    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([{ id: 1, name: "Ann", auth: "Bearer t-1" }]);
    expect(list.headers.get("x-upstream")).toBe("yes");
    expect(refund.status).toBe(200);
    expect(calls).toEqual(["GET /users"]);
    expect(mock.getRouteSource("users", "list")).toBe("upstream");
    expect(mock.getRouteSource("orders", "refund")).toBe("auto");
  });

  it("answers with the server's failure as the server gave it", async () => {
    const mock = createAutoMockServer({
      source: api(upstreamUrl),
      endpoints: ["orders.refund"],
      log: false,
    });

    const missing = await mock.app.request("/users/9");

    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "no such user" });
  });

  it("does not start when it names an endpoint its source does not have", () => {
    expect(() =>
      createAutoMockServer({ source: api(upstreamUrl), endpoints: ["orders.refnd"], log: false }),
    ).toThrow(MockEndpointsError);
  });
});

describe("a mock that answers with recordings", () => {
  it("records an answer the first time and replays it, with the server gone", async () => {
    const file = join(dir, "fixtures", "shop.har");
    const first = createAutoMockServer({
      source: api(upstreamUrl),
      fixtures: { file },
      log: false,
    });
    await first.app.request("/users/1");
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    upstream = createServer(answer);

    const again = createAutoMockServer({
      source: api(upstreamUrl),
      fixtures: { file },
      log: false,
    });
    const replayed = await again.app.request("/users/1");

    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual({ id: 1, name: "Ann" });
    expect(calls).toEqual(["GET /users/1"]);
    expect(JSON.parse(readFileSync(file, "utf8")).log.entries).toHaveLength(1);
    expect(again.getRouteSource("users", "get")).toBe("fixtures");
  });

  it("says why when it has no recording and the server cannot be reached", async () => {
    const file = join(dir, "shop.har");
    const mock = createAutoMockServer({ source: api(upstreamUrl), fixtures: { file }, log: false });
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    upstream = createServer(answer);

    const failed = await mock.app.request("/users/1");

    expect(failed.status).toBe(502);
    expect(String((await failed.json()).error)).toContain("could not be reached");
  });

  it("lets an override answer an endpoint in place of its recordings", async () => {
    const file = join(dir, "shop.har");
    const mock = createAutoMockServer({
      source: api(upstreamUrl),
      fixtures: { file },
      overrides: (mockFn) => mockFn("users", "get").resolves({ id: 1, name: "Override" }),
      log: false,
    });

    const answered = await mock.app.request("/users/1");

    expect(await answered.json()).toEqual({ id: 1, name: "Override" });
    expect(calls).toEqual([]);
  });
});
