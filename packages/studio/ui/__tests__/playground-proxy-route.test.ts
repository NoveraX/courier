/**
 * The proxy route the Playground names for a call. A source that declares
 * none is called at Courier's default path, as a proxy caller calls it, so
 * the route is that path on the app's origin — not "no proxy route" while
 * the call goes through. Only a WebSocket, which has no default, has none.
 */
import { describe, expect, it } from "vitest";

import { proxyRouteOf } from "@/features/playground/proxy-route";
import type { CatalogEntry } from "@/store/types-ui";

const SOURCE: CatalogEntry = {
  baseURL: "https://api.example",
  appOrigin: "http://localhost:3000",
  groups: {},
};

describe("the proxy route of a source that declares no proxyPath", () => {
  it("is the default HTTP path on the app's origin", () => {
    expect(proxyRouteOf("http", SOURCE)).toEqual({
      display: "http://localhost:3000/api/request",
      kind: "resolved",
      declared: false,
    });
  });

  it("is the default stream path", () => {
    expect(proxyRouteOf("sse", SOURCE)?.display).toBe("http://localhost:3000/api/sse");
  });

  it("is none for a WebSocket, which has no default", () => {
    expect(proxyRouteOf("ws", SOURCE)).toBeUndefined();
  });

  it("stays the bare path while the app's origin is unknown", () => {
    const { appOrigin: _unknown, ...withoutOrigin } = SOURCE;

    expect(proxyRouteOf("http", withoutOrigin)).toMatchObject({
      display: "/api/request",
      kind: "unresolved",
    });
  });
});

describe("the proxy route of a source that declares one", () => {
  it("is the declared path on the app's origin", () => {
    const route = proxyRouteOf("http", { ...SOURCE, proxyPath: { http: "/courier" } });

    expect(route).toMatchObject({ display: "http://localhost:3000/courier", declared: true });
  });

  it("opens a declared WebSocket route on the app's origin with ws://, and keeps an absolute one", () => {
    expect(proxyRouteOf("ws", { ...SOURCE, proxyPath: { ws: "/live" } })?.display).toBe(
      "ws://localhost:3000/live",
    );
    expect(
      proxyRouteOf("ws", { ...SOURCE, proxyPath: { ws: "wss://edge.example/live" } }),
    ).toMatchObject({ display: "wss://edge.example/live", kind: "absolute" });
  });
});
