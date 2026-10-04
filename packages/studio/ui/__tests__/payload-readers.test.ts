/**
 * The readers the page takes socket events' fields through, rather than
 * casting each field to its type unread: a value of another shape — a port
 * sent as text, a route without its counts — never reaches the views as if
 * it had the declared one.
 */
import { describe, expect, it } from "vitest";

import {
  isMockScenarioEntry,
  readList,
  readMockRoutes,
  readNetworkConfig,
  readOneOf,
  readRequestTiming,
  readStringListRecord,
  readStringRecord,
} from "../src/store/payload";

const ROUTE = {
  group: "users",
  endpoint: "list",
  httpMethod: "GET",
  path: "",
  fullPath: "/users",
  source: "auto",
  hits: 0,
  avgLatency: 0,
};

describe("the payload readers", () => {
  it("read records of strings and of string lists, and nothing else", () => {
    expect(readStringRecord({ accept: "application/json" })).toEqual({
      accept: "application/json",
    });
    expect(readStringRecord({ accept: 1 })).toBeUndefined();
    expect(readStringRecord(["accept"])).toBeUndefined();
    expect(readStringListRecord({ auth: ["authorization"] })).toEqual({ auth: ["authorization"] });
    expect(readStringListRecord({ auth: "authorization" })).toBeUndefined();
  });

  it("refuse a record with a key that reaches a prototype", () => {
    const proto = readStringListRecord(JSON.parse('{"__proto__": ["x"]}'));
    expect(proto).toBeUndefined();
    expect(readStringRecord(JSON.parse('{"constructor": "x"}'))).toBeUndefined();
  });

  it("read a list only when every item passes", () => {
    const isText = (item: unknown): item is string => typeof item === "string";
    expect(readList(["a", "b"], isText)).toEqual(["a", "b"]);
    expect(readList(["a", 1], isText)).toBeUndefined();
    expect(readList({ 0: "a" }, isText)).toBeUndefined();
  });

  it("read routes, a route without its counts given none, and refuse one of another shape", () => {
    const { hits: _hits, avgLatency: _avg, ...withoutCounts } = ROUTE;
    expect(readMockRoutes([ROUTE])).toEqual([ROUTE]);
    expect(readMockRoutes([withoutCounts])).toEqual([ROUTE]);
    expect(readMockRoutes([{ ...ROUTE, hits: "3" }])).toBeUndefined();
    expect(readMockRoutes([{ ...ROUTE, source: "magic" }])).toBeUndefined();
  });

  it("read one of the values allowed, and a timing with every phase", () => {
    expect(readOneOf("3g", ["none", "3g"] as const)).toBe("3g");
    expect(readOneOf("5g", ["none", "3g"] as const)).toBeUndefined();
    expect(readRequestTiming({ total: 9, middleware: 1, fetch: 7, validation: 1 })).toEqual({
      total: 9,
      middleware: 1,
      fetch: 7,
      validation: 1,
    });
    expect(readRequestTiming({ total: 9, fetch: 7 })).toBeUndefined();
  });

  it("tell a scenario by its endpoints and transitions", () => {
    const scenario = {
      name: "flaky",
      endpointCount: 1,
      isActive: false,
      hasStateMachine: true,
      stateTransitions: [{ from: "Started", to: "Down", trigger: "users.list" }],
      endpoints: [{ group: null, endpoint: "list", httpMethod: "GET", behavior: "rejects" }],
    };

    expect(isMockScenarioEntry(scenario)).toBe(true);
    expect(isMockScenarioEntry({ ...scenario, endpoints: [{ behavior: "explodes" }] })).toBe(false);
  });

  it("read the network settings the mock sends, with null for no stop conditions", () => {
    const sent = {
      latency: { min: 300, max: 900, jitter: 150 },
      errorRate: 0.1,
      faultWeights: [{ type: "500", weight: 100 }],
      bandwidth: 0,
      distribution: "uniform",
      routeOverrides: [{ routeId: "users:list", enabled: true, latency: { min: 1, max: 2 } }],
      stopConditions: null,
    };

    expect(readNetworkConfig(sent)).toEqual({
      latency: { min: 300, max: 900, jitter: 150 },
      errorRate: 0.1,
      faultWeights: [{ type: "500", weight: 100 }],
      bandwidth: 0,
      routeOverrides: [
        { routeId: "users:list", enabled: true, latency: { min: 1, max: 2, jitter: 0 } },
      ],
    });
    expect(readNetworkConfig({ ...sent, latency: "3g" })).toBeUndefined();
    expect(readNetworkConfig({ ...sent, errorRate: "high" })).toBeUndefined();
  });
});
