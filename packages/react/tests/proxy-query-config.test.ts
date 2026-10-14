/**
 * What a proxy query client runs with: the source its routes name, or the
 * one it was given; the proxy paths, a caller's winning over those declared;
 * and the API's own say on cancelling and sharing reads, which the hooks
 * follow as `createProxyCaller` does unless the caller says otherwise.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { proxyQueryConfig } from "../src/proxy-query-config";

const { endpoint } = courier();

const api = defineApi({
  name: "shop",
  baseURL: "https://example.com",
  proxyPath: { http: "/shop/request", sse: "/shop/sse" },
  cancelPrevious: ["search"],
  coalesce: false,
  endpoints: { search: endpoint.get("search").variables<{ q: string }>() },
});

describe("proxyQueryConfig", () => {
  it("takes the source, and the API's say on reads, from the routes", () => {
    const config = proxyQueryConfig({
      source: "shop",
      endpoints: { search: { type: "query" } },
      cancelPrevious: ["search"],
      coalesce: false,
    });

    expect(config.source).toBe("shop");
    expect(config.defaults).toMatchObject({ cancelPrevious: ["search"], coalesce: false });
  });

  it("follows the API given as the source, as createProxyCaller does", () => {
    const config = proxyQueryConfig("shop", { source: api });

    expect(config.defaults).toMatchObject({
      cancelPrevious: ["search"],
      coalesce: false,
      proxyPath: { http: "/shop/request", sse: "/shop/sse" },
    });
  });

  it("lets the caller's own options win, one transport's path at a time", () => {
    const config = proxyQueryConfig("shop", {
      source: api,
      cancelPrevious: [],
      coalesce: true,
      proxyPath: { sse: "/events" },
    });

    expect(config.defaults).toMatchObject({
      cancelPrevious: [],
      coalesce: true,
      proxyPath: { http: "/shop/request", sse: "/events" },
    });
  });
});
