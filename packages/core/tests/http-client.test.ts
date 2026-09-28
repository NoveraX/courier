/**
 * The HTTP client's defaults, as a real upstream receives them.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";

const { endpoint } = courier();
const items = defineGroup({
  prefix: "items",
  endpoints: {
    list: endpoint.get(""),
    create: endpoint.post("").variables<{ name: string }>(),
  },
});

let upstream: EchoServer;

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

function sourceWithHeaders(headers: HeadersInit) {
  return defineApi({ name: "api", baseURL: upstream.origin, headers, groups: { items } });
}

describe("headers declared on the source", () => {
  it("are sent with every direct call", async () => {
    const api = sourceWithHeaders({ "x-api-key": "server-secret", authorization: "Bearer server" });

    await createCaller(api).items.list();
    await createCaller(api).items.create({ name: "a" });

    for (const request of upstream.received) {
      expect(request.headers["x-api-key"]).toBe("server-secret");
      expect(request.headers.authorization).toBe("Bearer server");
    }
    expect(upstream.received).toHaveLength(2);
  });

  it("are sent when the call arrives through the proxy", async () => {
    registerSources({ api: sourceWithHeaders({ "x-api-key": "server-secret" }) });

    const response = await createHandler().handlePost(
      new Request("http://app.localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "api", group: "items", method: "list" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(upstream.last().headers["x-api-key"]).toBe("server-secret");
  });

  it("give way to a header the call names itself", async () => {
    const api = sourceWithHeaders({ "x-tenant": "default", "x-kept": "yes" });

    await createCaller(api, { headers: { "x-tenant": "caller" } }).items.list();

    expect(upstream.last().headers["x-tenant"]).toBe("caller");
    expect(upstream.last().headers["x-kept"]).toBe("yes");
  });

  it("keep the JSON content type of a body", async () => {
    const api = sourceWithHeaders({ "x-api-key": "k" });

    await createCaller(api).items.create({ name: "a" });

    expect(upstream.last().headers["content-type"]).toBe("application/json");
    expect(JSON.parse(upstream.last().body.toString())).toEqual({ name: "a" });
  });
});

describe("an incoming request's headers forwarded whole", () => {
  it("are sent without the ones describing the connection they arrived on", async () => {
    const api = sourceWithHeaders({});
    const incoming = new Headers({
      host: "app.example.com",
      connection: "keep-alive, x-hop",
      "keep-alive": "timeout=5",
      "x-hop": "1",
      "transfer-encoding": "chunked",
      "content-length": "17",
      cookie: "sid=abc",
      "x-trace": "t-1",
    });

    await createCaller(api).items.with({ headers: incoming }).create({ name: "a" });

    const { headers, body } = upstream.last();
    expect(headers.host).toBe(new URL(upstream.origin).host);
    expect(headers["content-length"]).toBe(String(body.byteLength));
    expect(headers["keep-alive"]).toBeUndefined();
    expect(headers["x-hop"]).toBeUndefined();
    expect(headers.cookie).toBe("sid=abc");
    expect(headers["x-trace"]).toBe("t-1");
  });
});
