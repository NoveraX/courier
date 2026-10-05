/**
 * The Network tab's figures: the live figures and their sparklines, the
 * latency histogram, the status strip, the faults chaos injected told apart
 * from a handler's own errors, the delay a range stands for, the route
 * overrides the mock already holds, what the mock simulates in all, and
 * the log of runs with their length.
 */
import { describe, expect, it } from "vitest";

import { chaosModeOf } from "@/features/mocks/chaos-config";
import { experimentLog, runLength } from "@/features/mocks/experiment-log";
import { delayLabel, delayOf, delayWindow } from "@/features/mocks/latency-window";
import { injectedFault } from "@/features/mocks/mock-log";
import { bandwidthLabel, networkConditionOf } from "@/features/mocks/network-condition";
import { networkLive } from "@/features/mocks/network-live";
import { faultsByType, latencyHistogram, statusStrip } from "@/features/mocks/observed-model";
import {
  hasOwnSettings,
  overrideRows,
  routeOverridesOf,
  withGlobalField,
  withOwnField,
} from "@/features/mocks/route-overrides";
import type { ExperimentEvent, MockRequestLog } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";

const NOW = 1_000_000;

function answered(n: number, fields: (i: number) => Partial<MockRequestLog>): MockRequestLog[] {
  return Array.from({ length: n }, (_, i) =>
    mockLog({ id: `log-${i}`, timestamp: NOW - i * 1_000, ...fields(i) }),
  );
}

describe("the live figures", () => {
  it("count the last minute's answers and the failures among the latest sixty", () => {
    const logs = [
      ...answered(9, () => ({ duration: 40 })),
      mockLog({
        id: "fail",
        timestamp: NOW - 9_000,
        status: 503,
        error: "HTTP 503 (simulated)",
        duration: 2,
      }),
      mockLog({ id: "old", timestamp: NOW - 90_000 }),
    ];

    const [throughput, errors, p50, p99] = networkLive(logs, NOW, 500);

    expect(throughput?.value).toBe("10/m");
    expect(errors).toMatchObject({ value: "9%", tone: "err" });
    expect(p50?.value).toBe("40ms");
    expect(p99?.tone).toBe("normal");
    expect(throughput?.spark).toHaveLength(20);
    expect(p50?.spark.every((bar) => bar.tone === "ok")).toBe(true);
  });

  it("tone a slow p99 against Studio's threshold", () => {
    const logs = answered(10, (i) => ({ duration: i === 0 ? 1_500 : 20 }));

    expect(networkLive(logs, NOW, 500)[3]).toMatchObject({ value: "1.50s", tone: "err" });
    expect(networkLive([], NOW, 500)[2]?.value).toBe("—");
  });
});

describe("what the latest answers looked like", () => {
  it("spreads their durations over fixed ranges, toned by the slow threshold", () => {
    const bins = latencyHistogram(
      answered(4, (i) => ({ duration: [10, 30, 650, 2_500][i] })),
      500,
    );

    expect(bins.map((bin) => bin.count)).toEqual([2, 0, 0, 0, 1, 0, 0, 1, 0]);
    expect(bins[0]).toMatchObject({ label: "50", share: 1, tone: "brand" });
    expect(bins.map((bin) => bin.tone)).toEqual([
      "brand",
      "brand",
      "brand",
      "brand",
      "warn",
      "warn",
      "err",
      "err",
      "err",
    ]);
  });

  it("lays sixty cells oldest first, empty ones first, a dropped connection named as one, each naming its request", () => {
    const strip = statusStrip([
      mockLog({ id: "rst", status: 502, error: "Connection Reset (simulated)", path: "/orders" }),
      mockLog({ id: "ok" }),
    ]);

    expect(strip).toHaveLength(60);
    expect(strip[0]).toEqual({ tone: "empty", tip: "" });
    expect(strip[58]).toEqual({ tone: "ok", tip: "200 · /api/users", id: "ok" });
    expect(strip[59]).toEqual({ tone: "err", tip: "reset · /orders", id: "rst" });
  });

  it("counts only the faults chaos injected, not a handler's own errors", () => {
    const logs = [
      mockLog({ id: "a", status: 500, error: "HTTP 500 (simulated)" }),
      mockLog({ id: "b", status: 500, error: "Internal error" }),
      mockLog({ id: "c", status: 408, error: "Request Timeout (simulated)" }),
      mockLog({ id: "d", status: 503, error: "HTTP 503 (simulated)" }),
      mockLog({ id: "e", status: 503 }),
    ];

    expect(faultsByType(logs)).toEqual([
      { kind: "500", count: 1 },
      { kind: "503", count: 1 },
      { kind: "timeout", count: 1 },
      { kind: "reset", count: 0 },
    ]);
  });

  it("tells each injected fault by the mock's wording for it", () => {
    expect(injectedFault({ error: "HTTP 502 (simulated)" })).toBe("502");
    expect(injectedFault({ error: "Connection Reset (simulated)" })).toBe("reset");
    expect(injectedFault({ error: "HTTP 500" })).toBeUndefined();
    expect(injectedFault({ error: undefined })).toBeUndefined();
  });
});

describe("a mock's added delay", () => {
  it("reads a range as its middle and the jitter that spans the same delays", () => {
    expect(delayOf({ min: 300, max: 900, jitter: 150 })).toEqual({ base: 600, jitter: 450 });
    expect(delayOf({ min: 400, max: 400, jitter: 120 })).toEqual({ base: 400, jitter: 120 });
    expect(delayOf(250)).toEqual({ base: 250, jitter: 0 });
    expect(delayOf(0)).toBeNull();
    expect(delayOf(undefined)).toBeNull();
  });

  it("reads a range whose maximum is below its minimum at the minimum, as the mock answers it", () => {
    expect(delayOf({ min: 300, max: 0, jitter: 0 })).toEqual({ base: 300, jitter: 0 });
  });

  it("spans delays never below zero, held at the track's end past two seconds", () => {
    expect(delayWindow({ base: 100, jitter: 300 })).toMatchObject({
      low: 0,
      high: 400,
      lowAt: 0,
      highAt: 20,
      baseAt: 5,
    });
    expect(delayWindow({ base: 1_800, jitter: 900 }).highAt).toBe(100);
    expect([delayLabel(0), delayLabel(150), delayLabel(1_050), delayLabel(2_000)]).toEqual([
      "0ms",
      "150ms",
      "1.05s",
      "2s",
    ]);
  });
});

describe("the route overrides", () => {
  const routes = [
    {
      group: "users",
      endpoint: "list",
      httpMethod: "get",
      path: "/users",
      fullPath: "/api/users",
      source: "auto" as const,
      hits: 0,
      avgLatency: 0,
    },
    {
      group: "orders",
      endpoint: "create",
      httpMethod: "post",
      path: "/orders",
      fullPath: "",
      source: "auto" as const,
      hits: 0,
      avgLatency: 0,
    },
  ];

  it("include the ones the mock already held when the page opened", () => {
    const server = mockServer({
      routeOverrides: [{ routeId: "users:list", enabled: false, errorRate: 0.5 }],
      networkConfig: {
        latency: 0,
        errorRate: 0,
        routeOverrides: [
          { routeId: "users:list", enabled: true },
          { routeId: "orders:create", enabled: true, latency: { min: 300, max: 300, jitter: 0 } },
        ],
      },
    });

    expect(routeOverridesOf(server).map((o) => [o.routeId, o.enabled])).toEqual([
      ["users:list", false],
      ["orders:create", true],
    ]);
  });

  it("list every route with what its override does", () => {
    const server = mockServer({
      routes,
      routeOverrides: [
        {
          routeId: "orders:create",
          enabled: true,
          latency: { min: 300, max: 300, jitter: 0 },
          errorRate: 0.5,
        },
      ],
    });

    expect(
      overrideRows(server).map(({ method, path, name, tag, tone }) => ({
        method,
        path,
        name,
        tag,
        tone,
      })),
    ).toEqual([
      { method: "GET", path: "/api/users", name: "users.list", tag: "global", tone: "subtle" },
      { method: "POST", path: "/orders", name: "orders.create", tag: "+300ms · 50%", tone: "err" },
    ]);
  });
});

describe("a route override's own settings", () => {
  const off = { routeId: "users:list", enabled: false };

  it("are set one at a time, each switching the override on and keeping the other", () => {
    const delayed = withOwnField(off, "delay", 300);
    const both = withOwnField(delayed, "rate", 50);

    expect(delayed).toEqual({
      routeId: "users:list",
      enabled: true,
      latency: { min: 300, max: 300, jitter: 0 },
    });
    expect(both).toEqual({ ...delayed, errorRate: 0.5 });
  });

  it("go back to the global ones one at a time, the last switching the override off", () => {
    const both = withOwnField(withOwnField(off, "delay", 300), "rate", 50);
    const rateOnly = withGlobalField(both, "delay");

    expect(rateOnly).toEqual({ routeId: "users:list", enabled: true, errorRate: 0.5 });
    expect(withGlobalField(rateOnly, "rate")).toEqual({ routeId: "users:list", enabled: false });
  });

  it("count a rate of 0 as the route's own: it never fails, whatever the global rate", () => {
    const shielded = withOwnField(off, "rate", 0);
    const server = mockServer({
      routes: [
        {
          group: "users",
          endpoint: "list",
          httpMethod: "get",
          path: "/users",
          fullPath: "/api/users",
          source: "auto",
          hits: 0,
          avgLatency: 0,
        },
      ],
      routeOverrides: [shielded],
    });

    expect(hasOwnSettings(shielded)).toBe(true);
    expect(hasOwnSettings({ ...shielded, enabled: false })).toBe(false);
    expect(overrideRows(server)[0]).toMatchObject({ tag: "0%", tone: "brand" });
  });
});

describe("what a mock simulates", () => {
  it("sums up its rate, delay and bandwidth cap, and the routes answered under an override of their own", () => {
    const server = mockServer({
      networkConfig: {
        errorRate: 0.4,
        latency: { min: 300, max: 900, jitter: 150 },
        bandwidth: 512,
        routeOverrides: [
          { routeId: "users:list", enabled: true, errorRate: 0.5 },
          { routeId: "users:get", enabled: true, latency: { min: 0, max: 0, jitter: 0 } },
          { routeId: "orders:list", enabled: false, errorRate: 1 },
        ],
      },
    });

    expect(networkConditionOf(server)).toEqual({
      rate: 40,
      delay: { base: 600, jitter: 450 },
      kbps: 512,
      routes: 2,
    });
  });

  it("names a bandwidth cap in Kbps below a megabit and in Mbps from one up", () => {
    expect(bandwidthLabel(512)).toBe("512 Kbps");
    expect(bandwidthLabel(1_500)).toBe("1.5 Mbps");
    expect(bandwidthLabel(10_000)).toBe("10 Mbps");
  });
});

describe("the log of runs", () => {
  function event(
    id: string,
    type: ExperimentEvent["type"],
    mode: string,
    timestamp: number,
  ): ExperimentEvent {
    return { id, serverId: "api-mock", type, mode, timestamp, errorRate: 0 };
  }

  it("gives a stop and a halt the length of the run they ended", () => {
    const history = [
      event("e4", "auto-halted", "chaos", 90_000),
      event("e3", "started", "unstable", 80_000),
      event("e2", "stopped", "3g", 50_000),
      event("e1", "started", "3g", 8_000),
      { ...event("x", "started", "down", 1_000), serverId: "other" },
    ];

    expect(
      experimentLog(history, "api-mock").map(({ type, mode, ranMs }) => [type, mode, ranMs]),
    ).toEqual([
      ["auto-halted", "unstable", 10_000],
      ["started", "unstable", undefined],
      ["stopped", "3g", 42_000],
      ["started", "3g", undefined],
    ]);
    expect([runLength(42_000), runLength(83_000)]).toEqual(["42s", "1m 23s"]);
  });

  it("takes a run's length from the mock when its start came before the page opened", () => {
    const stopped = { ...event("e1", "stopped", "down", 50_000), durationMs: 12_000 };

    expect(experimentLog([stopped], "api-mock")[0]?.ranMs).toBe(12_000);
  });

  it("names the mode of a mock without chaos stable", () => {
    expect(chaosModeOf("none")).toBe("stable");
    expect(chaosModeOf("down")).toBe("down");
  });
});
