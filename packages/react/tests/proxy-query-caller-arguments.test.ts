import { courier, defineApi, defineBoundary, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { liveApi } from "./helpers/live-api";

const { endpoint } = courier();

const httpOnlyApi = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    users: defineGroup({ prefix: "/users", endpoints: { list: endpoint.get("").response<string[]>() } }),
  },
});

const boundary = defineBoundary<typeof liveApi>({
  source: "api",
  expose: { "live.ticks": "stream", "live.room": "duplex" },
  proxyPath: { ws: "wss://realtime.example.com" },
});

/**
 * A proxy query caller for an API with streams or channels asks for the
 * boundary those hooks reach, as `createProxyCaller` does: without one, a
 * channel has no WebSocket path to open and fails the first time it is used.
 */
describe("createProxyQueryCaller arguments", () => {
  it("needs nothing more for an API of plain requests", () => {
    expect(createProxyQueryCaller<typeof httpOnlyApi>("api")).toBeTypeOf("object");
  });

  it("takes a boundary or the source for an API with streams and channels", () => {
    expect(createProxyQueryCaller<typeof liveApi>("api", { boundary })).toBeTypeOf("object");
    expect(createProxyQueryCaller<typeof liveApi>("api", { source: liveApi })).toBeTypeOf("object");
  });

  it("refuses an API with streams and channels without either", () => {
    function refused(): void {
      // @ts-expect-error — the hooks of liveApi need a boundary or the source
      createProxyQueryCaller<typeof liveApi>("api", { proxyPath: { http: "/api/request" } });
      // @ts-expect-error — the hooks of liveApi need a boundary or the source
      createProxyQueryCaller<typeof liveApi>("api");
    }

    expect(refused).toBeTypeOf("function");
  });
});
