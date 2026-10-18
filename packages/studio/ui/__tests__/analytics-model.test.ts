/**
 * Analytics' figures, worked out from the calls Studio holds: the window a
 * range covers, which ends now; the headline figures and their moves
 * against the first half of that window by time; the response-time bins,
 * the status groups — every failure in one — the bars over time, the
 * endpoints and their sort, and the page's address.
 */
import { describe, expect, it } from "vitest";

import {
  analyticsSearch,
  analyticsView,
  sortedBy,
  validateAnalyticsSearch,
} from "@/features/analytics/analytics-search";
import { analyticsWindow, halvesOf, stretchesOf } from "@/features/analytics/analytics-window";
import { endpointRows, sortEndpointRows } from "@/features/analytics/endpoint-rows";
import { kpiFigures } from "@/features/analytics/kpi-figures";
import { latencyBins } from "@/features/analytics/latency-bins";
import { requestSeries } from "@/features/analytics/request-series";
import { fillGaps, sparkPath } from "@/features/analytics/spark-path";
import { statusBreakdown, statusGroupOf } from "@/features/analytics/status-breakdown";
import { trendOf } from "@/features/analytics/trend";
import type { RequestEntry } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const NOW = 10_000_000;

let seq = 0;
function call(agoMs: number, fields: Partial<RequestEntry> = {}): RequestEntry {
  seq += 1;
  return requestEntry({ id: `c${seq}`, startedAt: NOW - agoMs, ...fields });
}

function timed(total: number): Pick<RequestEntry, "timing"> {
  return { timing: { total, middleware: 0, fetch: total, validation: 0 } };
}

describe("the window a range covers", () => {
  it("holds the range's finished HTTP calls, oldest first, and leaves streams and calls in flight out", () => {
    const calls = [
      call(10_000),
      call(90_000),
      call(5_000, { status: "pending" }),
      call(4_000, { transport: "sse", streamStatus: "complete" }),
      call(30_000),
    ];

    const win = analyticsWindow(calls, "1m", NOW);

    expect(win.done.map((r) => NOW - r.startedAt)).toEqual([30_000, 10_000]);
    expect(analyticsWindow(calls, "session", NOW).done).toHaveLength(3);
  });

  it("ends now and spans a minute at the least, so a young session's last bar is now", () => {
    const win = analyticsWindow([call(20_000)], "session", NOW);

    expect(win.start + win.span).toBe(NOW);
    expect(win.span).toBe(60_000);
    expect(stretchesOf(win, 30, (calls) => calls.length).indexOf(1)).toBe(20);
  });

  it("spans from the oldest call when that is longer ago, and counts a call begun since now in the last stretch", () => {
    const win = analyticsWindow([call(180_000), call(-2_000)], "session", NOW);

    expect(win.span).toBe(180_000);
    expect(stretchesOf(win, 12, (calls) => calls.length)).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });

  it("splits its calls into halves by time, not by count", () => {
    const win = analyticsWindow(
      [call(110_000), call(50_000), call(40_000), call(10_000)],
      "session",
      NOW,
    );

    const [before, after] = halvesOf(win);

    expect(before).toHaveLength(1);
    expect(after).toHaveLength(3);
  });
});

describe("a figure's move", () => {
  it("is flat within 5%, a percentage beyond, good or bad by which way is better", () => {
    expect(trendOf(100, 103)).toEqual({ label: "flat", direction: "flat", good: null });
    expect(trendOf(570, 520, true)).toEqual({ label: "9%", direction: "down", good: true });
    expect(trendOf(10, 30)).toEqual({ label: "200%", direction: "up", good: true });
    expect(trendOf(1, 100)).toMatchObject({ label: "999%" });
  });

  it("reads as new when the first half had none, and makes no trend from a figure a half cannot have", () => {
    expect(trendOf(0, 7.5, true)).toEqual({ label: "new", direction: "up", good: false });
    expect(trendOf(0, 0)).toMatchObject({ direction: "flat" });
    expect(trendOf(null, 95)).toMatchObject({ direction: "flat" });
  });
});

describe("the headline figures", () => {
  const calls = [
    call(120_000, timed(80)),
    call(50_000, timed(100)),
    call(40_000, { ...timed(900), status: "error", statusCode: 500, size: 2048 }),
    call(10_000, { ...timed(300), size: 1024 }),
  ];
  const figures = kpiFigures(analyticsWindow(calls, "session", NOW), "session", 500);
  const byKey = new Map(figures.map((f) => [f.key, f]));

  it("says what the calls come to, each in the colour it reads in", () => {
    expect(figures.map((f) => [f.label, f.value])).toEqual([
      ["Total requests", "4"],
      ["Success rate", "75.0%"],
      ["P95 latency", "900ms"],
      ["Errors", "1"],
      ["Throughput", "2.0/min"],
      ["Avg size", "768 B"],
    ]);
    expect(byKey.get("success")?.tone).toBe("err");
    expect(byKey.get("p95")?.tone).toBe("warn");
    expect(byKey.get("p95")?.sub).toBe("p50 300ms · p99 900ms");
    expect(byKey.get("throughput")?.sub).toBe("over 2m 0s");
    expect(byKey.get("total")?.sub).toBe("this session");
  });

  it("moves the total by the calls of each half of the window's time", () => {
    expect(byKey.get("total")?.trend).toEqual({ label: "200%", direction: "up", good: true });
    expect(byKey.get("errors")?.trend).toMatchObject({ label: "new", good: false });
  });
});

describe("a recovery", () => {
  it("reads forward in time though the store holds the newest call first", () => {
    const failed = { status: "error", statusCode: 500 } as const;
    const chronological = Array.from({ length: 40 }, (_, i) =>
      call(120_000 - i * 3_000, i < 15 ? { ...timed(10), ...failed } : timed(10)),
    );
    const newestFirst = [...chronological].reverse();

    const figures = kpiFigures(analyticsWindow(newestFirst, "session", NOW), "session", 500);
    const byKey = new Map(figures.map((f) => [f.key, f]));

    expect(byKey.get("success")?.trend).toMatchObject({ direction: "up", good: true });
    expect(byKey.get("errors")?.trend).toMatchObject({ direction: "down", good: true });
    expect(byKey.get("success")?.spark.end).toBeCloseTo(4 / 32);
  });
});

describe("the response-time distribution", () => {
  it("bins the times, splits out the failures, tags the percentiles and colours by the slow threshold", () => {
    const calls = [
      call(1, timed(20)),
      call(2, timed(40)),
      call(3, { ...timed(700), status: "error", statusCode: 502 }),
      call(4, { ...timed(2500), status: "aborted" }),
    ];

    const { bins, p50, p95 } = latencyBins(calls, 500);

    expect(bins.map((b) => b.count)).toEqual([2, 0, 0, 0, 0, 1, 0, 0]);
    expect(bins[5]).toMatchObject({ label: "1s", failed: 1, tone: "warn", tags: ["p95"] });
    expect(bins[0]?.tags).toEqual(["p50"]);
    expect(bins.map((b) => b.tone)).toEqual([
      "brand",
      "brand",
      "brand",
      "brand",
      "brand",
      "warn",
      "err",
      "err",
    ]);
    expect([p50, p95]).toEqual([40, 700]);
  });
});

describe("the status breakdown", () => {
  it("groups each call by how it ended, a failure with no 4xx or 5xx among the other errors", () => {
    expect(statusGroupOf({ status: "error", statusCode: 404 })).toBe("client");
    expect(statusGroupOf({ status: "error", statusCode: 503 })).toBe("server");
    expect(statusGroupOf({ status: "error", statusCode: undefined })).toBe("other");
    expect(statusGroupOf({ status: "validation_error", statusCode: 200 })).toBe("validation");
  });

  it("lists every group, and the other errors only when there are some, so the shares add up", () => {
    const quiet = statusBreakdown([call(1), call(2, { status: "aborted" })]);
    const failing = statusBreakdown([call(1), call(2, { status: "error", statusCode: undefined })]);

    expect(quiet.map((g) => g.key)).toEqual([
      "success",
      "client",
      "server",
      "validation",
      "aborted",
    ]);
    expect(failing.at(-1)).toMatchObject({
      key: "other",
      label: "Other errors",
      count: 1,
      share: 0.5,
    });
    expect(failing.reduce((sum, g) => sum + g.share, 0)).toBe(1);
  });
});

describe("requests over time", () => {
  it("draws thirty bars ending now, the failures apart, with the tallest", () => {
    const win = analyticsWindow(
      [call(500), call(1_000, { status: "error", statusCode: 500 }), call(59_000)],
      "1m",
      NOW,
    );

    const { bars, max } = requestSeries(win);

    expect(bars).toHaveLength(30);
    expect(bars.at(-1)).toEqual({ ok: 1, failed: 1 });
    expect(bars[0]).toEqual({ ok: 1, failed: 0 });
    expect(max).toBe(2);
  });
});

describe("the endpoints", () => {
  const calls = [
    call(30, { ...timed(100), source: "billing", group: "invoices", method: "list" }),
    call(20, {
      ...timed(300),
      source: "billing",
      group: "invoices",
      method: "list",
      status: "error",
      statusCode: 500,
    }),
    call(10, { source: "api", group: undefined, method: "health", status: "aborted" }),
  ];

  it("make one row each, newest call first, with its times, size and failures", () => {
    const rows = endpointRows(calls);
    const invoices = rows.find((r) => r.key === "billing.invoices.list");

    expect(invoices).toMatchObject({
      prefix: "billing.",
      name: "invoices.list",
      calls: 2,
      avg: 200,
      p95: 300,
      failed: 1,
      errorRate: 50,
    });
    expect(invoices?.requests.map((r) => r.id)).toEqual([calls[1]?.id, calls[0]?.id]);
    expect(rows.find((r) => r.key === "api.health")).toMatchObject({ avg: null, p95: null });
  });

  it("sort by a column, a row without the figure last, names A to Z", () => {
    const rows = endpointRows(calls);

    expect(sortEndpointRows(rows, "p95", "asc").map((r) => r.key)).toEqual([
      "billing.invoices.list",
      "api.health",
    ]);
    expect(sortEndpointRows(rows, "endpoint", "asc").map((r) => r.key)).toEqual([
      "api.health",
      "billing.invoices.list",
    ]);
  });
});

describe("a call another call's request answered", () => {
  /* Slower, larger and failing, so counting it anywhere it does not belong would show. */
  const sent = call(10_000, { ...timed(100), size: 100 });
  const joined = call(9_000, {
    ...timed(5_000),
    size: 100,
    status: "error",
    shared: { by: "flight", with: sent.id },
  });

  it("sent no request: the window's requests leave it out, its calls do not", () => {
    const win = analyticsWindow([sent, joined], "1m", NOW);

    expect(win.done.map((r) => r.id)).toEqual([sent.id, joined.id]);
    expect(win.sent.map((r) => r.id)).toEqual([sent.id]);
  });

  it("counts in no headline figure, and the total names the calls beside the requests", () => {
    const kpis = kpiFigures(analyticsWindow([sent, joined], "1m", NOW), "1m", 500);

    expect(kpis.map((k) => [k.key, k.value])).toEqual([
      ["total", "1"],
      ["success", "100.0%"],
      ["p95", "100ms"],
      ["errors", "0"],
      ["throughput", "1.0/min"],
      ["size", "100 B"],
    ]);
    expect(kpis[0]?.sub).toBe("last minute · 2 calls");
  });

  it("counts among its endpoint's calls, and in none of its request figures", () => {
    const [row] = endpointRows(analyticsWindow([sent, joined], "1m", NOW).done);

    expect(row).toMatchObject({ calls: 2, p95: 100, failed: 0, errorRate: 0, size: 100 });
    expect(latencyBins(analyticsWindow([sent, joined], "1m", NOW).sent, 500).p95).toBe(100);
  });
});

describe("the page's address", () => {
  it("keeps only what differs from the whole session sorted by the slowest p95", () => {
    expect(validateAnalyticsSearch({ range: "session", sort: "p95", dir: "desc" })).toEqual({});
    expect(validateAnalyticsSearch({ range: "1m", sort: "endpoint", dir: "asc" })).toEqual({
      range: "1m",
      sort: "endpoint",
    });
    expect(validateAnalyticsSearch({ range: "1h", sort: "nope", dir: "up" })).toEqual({});
    expect(analyticsView({ sort: "endpoint" })).toEqual({
      range: "session",
      sort: "endpoint",
      dir: "asc",
    });
  });

  it("turns a column around on a second click, and starts another in its first direction", () => {
    const view = analyticsView({});

    expect(sortedBy(view, "p95")).toMatchObject({ sort: "p95", dir: "asc" });
    expect(sortedBy(view, "endpoint")).toMatchObject({ sort: "endpoint", dir: "asc" });
    expect(analyticsSearch(sortedBy(view, "calls"))).toEqual({ sort: "calls" });
  });
});

describe("a sparkline", () => {
  it("fills stretches without a value from the one before, and scales a flat series near the bottom", () => {
    expect(fillGaps([null, 90, null, 100])).toEqual([90, 90, 90, 100]);
    expect(fillGaps([null, null])).toEqual([0, 0]);
    expect(sparkPath([3, 5, 4]).line).toBe("M0.00 29.00 L50.00 4.00 L100.00 16.50");
    expect(sparkPath([5, 5]).end).toBeCloseTo(29 / 32);
  });
});
