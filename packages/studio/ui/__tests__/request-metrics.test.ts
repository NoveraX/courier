/**
 * The figures over the new Timeline and in the inspector: requests a
 * second over the last minute, its p95 and error rate and the streams
 * open; an endpoint's p95; a request's time phase by phase and against
 * that p95; its middleware steps; and the route a proxied call took.
 */
import { describe, expect, it } from "vitest";

import { middlewareSteps, proxyRouteOf } from "@/features/requests/middleware-pipeline";
import { percentile } from "@/features/requests/percentile";
import { endpointLatency, liveKpis, throughputBars } from "@/features/requests/throughput";
import { compareToP95, timeTicks, timingPhasesOf } from "@/features/requests/timing-phases";
import type { MiddlewareEntry } from "@/store/types-events";
import { requestEntry } from "./request-entry-fixture";

const NOW = 10_000_000;
const timed = (id: string, ago: number, total: number, fields = {}) =>
  requestEntry({
    id,
    startedAt: NOW - ago,
    timing: { total, middleware: 0, fetch: total, validation: 0 },
    ...fields,
  });

function step(index: number, fields: Partial<MiddlewareEntry>): MiddlewareEntry {
  return {
    requestId: "r1",
    name: `mw${index}`,
    index,
    startedAt: 0,
    status: "completed",
    ...fields,
  };
}

describe("a percentile", () => {
  it("is the value at its rank, whatever the order, and none of nothing", () => {
    expect(percentile([30, 10, 20], 0.95)).toBe(30);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(6);
    expect(percentile([], 0.95)).toBeNull();
  });
});

describe("the last minute", () => {
  const REQUESTS = [
    timed("a", 500, 100),
    timed("b", 800, 300, { status: "error" }),
    timed("c", 2_500, 200),
    timed("old", 90_000, 50),
    requestEntry({ id: "p", startedAt: NOW - 100, status: "pending", timing: undefined }),
    requestEntry({ id: "s", startedAt: NOW - 30_000, transport: "ws", streamStatus: "streaming" }),
  ];

  it("counts each second's requests, failed apart, oldest second first, streams left out", () => {
    const bars = throughputBars(REQUESTS, NOW);

    expect(bars).toHaveLength(60);
    expect(bars.at(-1)).toEqual({ ok: 2, failed: 1, secondsAgo: 0 });
    expect(bars.at(-3)).toEqual({ ok: 1, failed: 0, secondsAgo: 2 });
    expect(bars.reduce((sum, b) => sum + b.ok + b.failed, 0)).toBe(4);
  });

  it("comes to the requests begun, the p95 and error rate of the finished, and the streams open", () => {
    expect(liveKpis(REQUESTS, NOW)).toEqual({
      perMinute: 4,
      p95: 300,
      errorRate: 1 / 3,
      liveStreams: 1,
    });
    expect(liveKpis([], NOW)).toEqual({ perMinute: 0, p95: null, errorRate: 0, liveStreams: 0 });
  });

  it("gives an endpoint's p95 over its finished calls", () => {
    const other = requestEntry({
      id: "x",
      method: "create",
      timing: { total: 9, middleware: 0, fetch: 9, validation: 0 },
    });

    expect(endpointLatency([...REQUESTS, other], REQUESTS[0] ?? other)).toEqual({
      p95: 300,
      count: 4,
    });
    expect(endpointLatency([requestEntry({ timing: undefined })], requestEntry())).toBeNull();
  });
});

describe("a request's time", () => {
  it("runs middleware in, fetch, validation and middleware out when its steps say how they split", () => {
    const r = requestEntry({
      timing: { total: 100, middleware: 20, fetch: 70, validation: 6 },
      middlewareEntries: [
        step(0, { beforeDuration: 8, afterDuration: 4 }),
        step(1, { beforeDuration: 4, afterDuration: 4 }),
      ],
    });

    expect(timingPhasesOf(r)).toEqual({
      total: 100,
      phases: [
        { key: "middleware-in", label: "Middleware in", start: 0, duration: 12 },
        { key: "fetch", label: "Fetch", start: 12, duration: 70 },
        { key: "validation", label: "Validation", start: 82, duration: 6 },
        { key: "middleware-out", label: "Middleware out", start: 88, duration: 8 },
        { key: "overhead", label: "Overhead", start: 96, duration: 4 },
      ],
    });
  });

  it("shows the middleware as one phase when its steps do not split, and leaves out what took no time", () => {
    const r = requestEntry({ timing: { total: 50, middleware: 0, fetch: 50, validation: 0 } });

    expect(timingPhasesOf(r)?.phases.map((p) => p.key)).toEqual(["fetch"]);
    expect(timingPhasesOf(requestEntry({ timing: undefined }))).toBeNull();
  });

  it("is marked at its start, quarters and end, and compared with its endpoint's p95", () => {
    expect(timeTicks(200)).toEqual(["0ms", "50ms", "100ms", "150ms", "200ms"]);
    expect(compareToP95(300, { p95: 100, count: 12 }, "users.list")).toEqual({
      label: "3.0× slower than p95",
      trend: "slower",
      detail: "users.list p95 100ms · 12 calls",
    });
    expect(compareToP95(50, { p95: 100, count: 1 }, "users.list").label).toBe(
      "2.0× faster than p95",
    );
    expect(compareToP95(105, { p95: 100, count: 1 }, "users.list").trend).toBe("in-line");
  });
});

describe("the middleware chain", () => {
  it("lists the steps in the order they ran, with the headers they added and the error thrown", () => {
    const r = requestEntry({
      middlewareEntries: [
        step(1, { name: "retry", phase: "wrap", status: "error", error: "gave up after 2 tries" }),
        step(0, { name: "auth", phase: "before", duration: 3, headersAdded: ["authorization"] }),
      ],
    });

    expect(middlewareSteps(r)).toEqual([
      {
        name: "auth",
        phase: "before",
        duration: 3,
        state: "ok",
        notes: [{ text: "+ authorization", tone: "ok" }],
      },
      {
        name: "retry",
        phase: "wrap",
        duration: undefined,
        state: "err",
        notes: [{ text: "gave up after 2 tries", tone: "err" }],
      },
    ]);
  });
});

describe("a proxied call's route", () => {
  const proxyTiming = {
    clientToProxy: 4,
    proxyToBackend: 10,
    backendToProxy: 80,
    proxyToClient: 3,
  };

  it("goes from the app, through Courier's proxy, to the source, timed either way", () => {
    const route = proxyRouteOf(requestEntry({ mode: "proxy", proxyTiming }), "browser");

    expect(route?.nodes.map((n) => n.label)).toEqual(["Browser", "Courier proxy", "api"]);
    expect(route?.legs).toEqual([
      { out: 4, back: 3 },
      { out: 10, back: 80 },
    ]);
    expect(
      proxyRouteOf(requestEntry({ mode: "proxy", proxyTiming }), undefined)?.nodes[0].label,
    ).toBe("Client");
  });

  it("is none for a direct call, or one not timed", () => {
    expect(proxyRouteOf(requestEntry({ mode: "direct", proxyTiming }), "server")).toBeNull();
    expect(proxyRouteOf(requestEntry({ mode: "proxy" }), "server")).toBeNull();
  });
});
