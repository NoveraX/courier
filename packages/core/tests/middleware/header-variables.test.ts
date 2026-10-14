/**
 * Variables an endpoint sends as request headers: an API's header
 * parameters. They are validated with the rest, then taken out of the path,
 * query and body and set as headers — directly, and in the application's
 * server for a call through the proxy.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import { headerVariablesMiddleware } from "../../src/middleware";
import { createProxyCaller } from "../../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../../src/sources";
import { isValidationError } from "../../src/validation";
import { type EchoServer, startEchoServer } from "../helpers/echo-server";
import { type ProxyServer, startProxyServer } from "../helpers/proxy-server";

const { endpoint } = courier();
let upstream: EchoServer;

function api() {
  return defineApi({
    expose: true,
    name: "things",
    baseURL: upstream.origin,
    endpoints: {
      find: endpoint
        .get("things")
        .variables<{ q: string; "X-Digest"?: string; "X-Tags"?: string[] }>()
        .use(headerVariablesMiddleware(["X-Digest", "X-Tags"])),
      create: endpoint
        .post("things")
        .variables(z.object({ name: z.string(), "Idempotency-Key": z.string().min(8) }))
        .use(headerVariablesMiddleware(["Idempotency-Key"])),
    },
  });
}

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

describe("variables sent as headers", () => {
  it("leave the query and reach the upstream as headers", async () => {
    await createCaller(api()).find({ q: "red", "X-Digest": "sha-256=abc", "X-Tags": ["a", "b"] });

    const sent = upstream.last();
    expect(sent.url).toBe("/things?q=red");
    expect(sent.headers["x-digest"]).toBe("sha-256=abc");
    expect(sent.headers["x-tags"]).toBe("a,b");
  });

  it("leave the body, which carries the other variables alone", async () => {
    await createCaller(api()).create({ name: "chair", "Idempotency-Key": "key-12345" });

    const sent = upstream.last();
    expect(JSON.parse(sent.body.toString())).toEqual({ name: "chair" });
    expect(sent.headers["idempotency-key"]).toBe("key-12345");
  });

  it("send no header for one left unset", async () => {
    await createCaller(api()).find({ q: "red" });

    expect(upstream.last().headers["x-digest"]).toBeUndefined();
  });

  it("are validated with the rest before they are sent", async () => {
    const failure = await createCaller(api())
      .create({ name: "chair", "Idempotency-Key": "short" })
      .catch((error: unknown) => error);

    expect(isValidationError(failure)).toBe(true);
    expect(upstream.received).toEqual([]);
  });
});

describe("variables sent as headers through the proxy", () => {
  let proxy: ProxyServer;

  beforeEach(async () => {
    registerSources({ things: api() });
    proxy = await startProxyServer();
  });

  afterEach(async () => {
    await proxy.close();
  });

  it("reach the upstream as headers from the application's server", async () => {
    const client = createProxyCaller<ReturnType<typeof api>>("things", {
      proxyPath: { http: proxy.url },
    });

    await client.create({ name: "chair", "Idempotency-Key": "key-12345" });

    const sent = upstream.last();
    expect(JSON.parse(sent.body.toString())).toEqual({ name: "chair" });
    expect(sent.headers["idempotency-key"]).toBe("key-12345");
  });
});
