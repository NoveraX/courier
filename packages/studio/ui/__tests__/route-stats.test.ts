/**
 * A route's running average latency, as requests to it complete: a route
 * announced without an average starts from none rather than becoming NaN.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { handleServerConnect } from "../src/store/handle-mock-server-events";
import { useMockStore } from "../src/store/mock-slice";
import { updateRouteStats } from "../src/store/route-stats";

beforeEach(() => {
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
});

describe("a route's average latency", () => {
  it("is the first request's duration when the route came without an average", () => {
    handleServerConnect("m", {
      type: "mock:server:connect",
      serverId: "m",
      managed: true,
      routes: [
        {
          group: "users",
          endpoint: "getAll",
          httpMethod: "GET",
          path: "",
          fullPath: "/users",
          source: "auto",
          hits: 0,
        },
      ],
    } as never);

    updateRouteStats("m", "users", "getAll", "GET", 40);
    updateRouteStats("m", "users", "getAll", "GET", 20);

    expect(useMockStore.getState().servers.m?.routes[0]).toMatchObject({ hits: 2, avgLatency: 30 });
  });
});
