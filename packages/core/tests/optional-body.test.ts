/**
 * A body the operation does not require — a list, a scalar — may be left
 * out of a call: the signature does not demand it, and a call made without it
 * is not validated as an empty object, which no list schema takes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";

const { endpoint } = courier();
let upstream: EchoServer;

function api() {
  return defineApi({
    name: "tags",
    baseURL: upstream.origin,
    endpoints: {
      setTags: endpoint.put("tags").variables(z.optional(z.array(z.string()))),
      setAll: endpoint.put("all").variables(z.array(z.string())),
      filter: endpoint.get("filter").variables(z.object({ q: z.string().optional() })),
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

describe("a body the operation does not require", () => {
  it("is left out of the call, which sends no body", async () => {
    await createCaller(api()).setTags();

    expect(upstream.last().body.length).toBe(0);
  });

  it("is sent when given", async () => {
    await createCaller(api()).setTags(["a"]);

    expect(JSON.parse(upstream.last().body.toString())).toEqual(["a"]);
  });

  it("is left out through the proxy as well", async () => {
    registerSources({ tags: api() });
    const proxy: ProxyServer = await startProxyServer();
    try {
      await createProxyCaller<ReturnType<typeof api>>("tags", {
        proxyPath: { http: proxy.url },
      }).setTags();

      expect(upstream.last().body.length).toBe(0);
    } finally {
      await proxy.close();
    }
  });
});

describe("variables a call cannot leave out", () => {
  it("are still demanded by the signature", () => {
    const client = createCaller(api());
    /* Only compiled: the call would fail validation. */
    function typed(): void {
      // @ts-expect-error — a required body cannot be left out
      void client.setAll();
    }

    expect(typed).toBeTypeOf("function");
  });

  it("stay optional where every field is, validated as an empty object", async () => {
    await createCaller(api()).filter();

    expect(upstream.last().url).toBe("/filter");
  });
});
