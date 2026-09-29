/**
 * The latency a scenario's summary gives an endpoint slowed by a named
 * profile: 3G was summarised as 2000 ms while the mock answers it in 300 to
 * 900 ms.
 */
import { describe, expect, it } from "vitest";

import type { RouteInfo } from "../../src/auto/route-types";
import { introspectScenario } from "../../src/auto/scenario-introspect";
import { LATENCY_PROFILES } from "../../src/network/latency";
import { defineScenario } from "../../src/scenario/define-scenario";

const routes: RouteInfo[] = [
  {
    group: "users",
    endpoint: "list",
    httpMethod: "GET",
    path: "",
    fullPath: "/users",
    hasIdParam: false,
    operation: "list",
  },
];

describe("a scenario slowed by a named profile", () => {
  it.each(["3g", "4g"] as const)(
    "summarises %s as the middle of the mock's own range",
    (profile) => {
      const scenario = defineScenario("slow", (mock) => {
        mock("users", "list").withLatency(profile).resolves([]);
      });

      const [entry] = introspectScenario(scenario, routes).endpoints;
      const { min, max } = LATENCY_PROFILES[profile] ?? { min: 0, max: 0 };

      expect(entry?.latency).toBe(Math.round((min + max) / 2));
    },
  );
});
