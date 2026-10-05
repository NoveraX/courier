import { describe, expect, it } from "vitest";

import { pickFault } from "../../src/network/failure";
import { createNetworkState } from "../../src/network/state";

describe("a route's own network override", () => {
  it("fails the share of the route's requests its error rate names, as the global rate does", () => {
    const state = createNetworkState({
      errorRate: 0,
      routeOverrides: [{ routeId: "users:list", enabled: true, errorRate: 0.5 }],
    });

    expect(state.getConfig("users", "list")?.errorRate).toBe(0.5);
    expect(state.getConfig("users", "get")?.errorRate).toBe(0);
  });

  it("keeps the global rate when it names none of its own", () => {
    const state = createNetworkState({
      errorRate: 0.25,
      routeOverrides: [{ routeId: "users:list", enabled: true, latency: { min: 10, max: 20 } }],
    });

    expect(state.getConfig("users", "list")).toMatchObject({
      errorRate: 0.25,
      latency: { min: 10, max: 20 },
    });
  });

  it("fails with the faults it names, though the global config weighs others", () => {
    const state = createNetworkState({
      errorRate: 1,
      faultWeights: [{ type: "503", weight: 100 }],
      routeOverrides: [{ routeId: "users:list", enabled: true, faultTypes: ["timeout"] }],
    });
    const route = state.getConfig("users", "list");
    const other = state.getConfig("users", "get");

    expect(route && pickFault(route)).toBe("timeout");
    expect(other && pickFault(other)).toBe("503");
  });
});
