/**
 * Variables carried from a browser client, through the proxy, to the upstream.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define/index";
import { ConfigurationError, HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";

const { endpoint } = courier();
const items = defineGroup({
  prefix: "items",
  endpoints: {
    create: endpoint.post("").variables<unknown>(),
    search: endpoint.get("").variables<unknown>(),
  },
});

let upstream: EchoServer;
let proxy: ProxyServer;

beforeEach(async () => {
  upstream = await startEchoServer();
  proxy = await startProxyServer();
  registerSources({
    api: defineApi({ expose: true, name: "api", baseURL: upstream.origin, groups: { items } }),
  });
});

afterEach(async () => {
  _resetSourcesForTests();
  await proxy.close();
  await upstream.close();
});

function browserClient() {
  const api = defineApi({ expose: true, name: "api", baseURL: upstream.origin, groups: { items } });
  return createProxyCaller<typeof api>("api", { proxyPath: { http: proxy.url } });
}

describe("variables sent through the proxy", () => {
  it("sends a JSON array body as an array", async () => {
    await browserClient().items.create([{ id: 1 }, { id: 2 }]);

    expect(JSON.parse(upstream.last().body.toString())).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("sends a JSON scalar as JSON", async () => {
    await browserClient().items.create("text");

    expect(upstream.last().body.toString()).toBe('"text"');
  });

  it("refuses a list read over GET rather than sending it as numbered fields", async () => {
    const failure = await browserClient()
      .items.with({ method: "GET" })
      .search([1, 2])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(400);
    expect(upstream.received).toHaveLength(0);
  });

  it.each([
    ["a Blob", () => new Blob(["bytes"])],
    ["an ArrayBuffer", () => new Uint8Array([1, 2]).buffer],
    ["a Uint8Array", () => new Uint8Array([1, 2])],
    ["URLSearchParams", () => new URLSearchParams({ a: "1" })],
    ["a ReadableStream", () => new ReadableStream()],
  ])("refuses %s before anything is sent, instead of an empty or mangled body", async (_, make) => {
    const failure = await browserClient()
      .items.create(make())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConfigurationError);
    expect((failure as ConfigurationError).code).toBe("PROXY_BODY_NOT_SUPPORTED");
    expect((failure as ConfigurationError).message).toMatch(/FormData/);
    expect(upstream.received).toHaveLength(0);
  });
});
