/**
 * What the Mocks dashboard shows, as data: the tone and code of a mock's
 * answer, the server's six figures, its busiest routes, and the banner
 * over the page in the order its causes take.
 */
import { describe, expect, it } from "vitest";

import { mockFigures, topRoutes } from "@/features/mocks/dashboard-model";
import { mockBannerOf } from "@/features/mocks/mock-banner";
import { mockLogCode, mockLogTone } from "@/features/mocks/mock-log";
import type { MockRouteEntry } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";

const NOW = 1_000_000;

function route(
  path: string,
  hits: number,
  source: MockRouteEntry["source"] = "auto",
): MockRouteEntry {
  return {
    group: "users",
    endpoint: "list",
    httpMethod: "get",
    path,
    fullPath: path,
    source,
    hits,
    avgLatency: 10,
  };
}

describe("a mock's answer", () => {
  it("reads green, amber for a client error, red for a server error or a failure", () => {
    expect([
      mockLogTone({ status: 200 }),
      mockLogTone({ status: 404 }),
      mockLogTone({ status: 503 }),
      mockLogTone({ error: "reset" }),
    ]).toEqual(["ok", "warn", "err", "err"]);
    expect([
      mockLogCode({ status: 201 }),
      mockLogCode({ error: "reset" }),
      mockLogCode({}),
    ]).toEqual(["201", "ERR", "···"]);
  });
});

describe("the dashboard's figures", () => {
  it("count routes, the last minute's answers, the error rate and latency, the scenario and the chaos", () => {
    const server = mockServer({
      routes: [route("/a", 3), route("/b", 1, "override")],
      requestsServed: 40,
      chaosPreset: "unstable",
      networkConfig: { latency: { min: 100, max: 300 }, errorRate: 0.25 },
      scenarios: [
        {
          name: "checkout-failure",
          endpointCount: 2,
          isActive: true,
          hasStateMachine: false,
          stateTransitions: [],
          endpoints: [],
        },
      ],
    });
    const logs = [
      mockLog({ id: "1", timestamp: NOW - 1_000, duration: 10 }),
      mockLog({ id: "2", timestamp: NOW - 2_000, duration: 900, status: 500 }),
      mockLog({ id: "3", timestamp: NOW - 120_000, duration: 20 }),
    ];

    expect(mockFigures(server, logs, NOW, 500).map((f) => [f.label, f.value, f.sub])).toEqual([
      ["Routes", "2", "1 overridden or custom"],
      ["Throughput", "2/min", "40 responses served"],
      ["Error rate", "33.3%", "last 60 responses"],
      ["P95 latency", "900ms", "p50 20ms"],
      ["Scenario", "checkout-failure", "2 overrides"],
      ["Chaos", "Unstable", "25% faults · 100–300ms delay"],
    ]);
  });

  it("rank the busiest routes against the busiest", () => {
    expect(
      topRoutes([route("/a", 2), route("/b", 8), route("/c", 4)]).map((t) => [
        t.route.path,
        t.share,
      ]),
    ).toEqual([
      ["/b", 1],
      ["/c", 0.5],
      ["/a", 0.25],
    ]);
  });
});

describe("the banner", () => {
  it("names the mocks file that does not load before anything else", () => {
    expect(
      mockBannerOf(mockServer({ processStatus: "crashed" }), {
        file: "/p/courier.mocks.ts",
        error: "SyntaxError: bad",
      })?.title,
    ).toBe("courier.mocks.ts does not load");
  });

  it("then a crashed or stopped server, chaos, and a scenario on", () => {
    expect(
      mockBannerOf(
        mockServer({
          processStatus: "crashed",
          lastError: "Error: EADDRINUSE: address in use :::7001",
        }),
        null,
      ),
    ).toMatchObject({
      tone: "err",
      detail: "Port 7001 is in use by another process",
      action: { kind: "start" },
    });
    expect(
      mockBannerOf(mockServer({ processStatus: "stopped", managed: false }), null),
    ).toMatchObject({ tone: "muted", action: undefined });
    expect(
      mockBannerOf(
        mockServer({ chaosPreset: "down", networkConfig: { latency: 0, errorRate: 1 } }),
        null,
      ),
    ).toMatchObject({
      title: "Chaos · Down",
      detail: "100% of responses are faulted",
      action: { kind: "stop-chaos" },
    });
    expect(mockBannerOf(mockServer({ activeScenario: "empty" }), null)).toMatchObject({
      title: "Scenario · empty",
      action: { kind: "reset-scenario" },
    });
    expect(mockBannerOf(mockServer({ activeScenario: "happy-path" }), null)).toBeUndefined();
    expect(mockBannerOf(mockServer(), null)).toBeUndefined();
  });
});
