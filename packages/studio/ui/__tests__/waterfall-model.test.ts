/**
 * What the Waterfall draws, as data: its address, each request's bar, the
 * window with its idle gaps and how time maps onto the track, the scale's
 * marks, which requests are in view, the rows they fall into and the
 * figures over them.
 */
import { describe, expect, it } from "vitest";

import { barOf } from "@/features/waterfall/bar-segments";
import { gapMarksOf, relativeTime, timeTicksOf } from "@/features/waterfall/time-ticks";
import { autoZoomOf, timeWindowOf, trackScaleOf } from "@/features/waterfall/time-window";
import { waterfallInsights } from "@/features/waterfall/waterfall-insights";
import { requestsInView, streamsInView } from "@/features/waterfall/waterfall-items";
import { sortItems, waterfallRows } from "@/features/waterfall/waterfall-rows";
import {
  searchFromView,
  validateWaterfallSearch,
  viewFromSearch,
} from "@/features/waterfall/waterfall-search";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

const timing = { total: 100, middleware: 20, fetch: 70, validation: 10 };

function item(id: string, startedAt: number, total: number, extra: Partial<RequestEntry> = {}) {
  const request = requestEntry({
    id,
    startedAt,
    timing: { ...timing, total, fetch: total - 30 },
    ...extra,
  });
  return { request, bar: barOf(request, startedAt + total) };
}

describe("the Waterfall's address", () => {
  it("keeps only what differs from the defaults", () => {
    expect(
      validateWaterfallSearch({ sort: "duration", group: "none", mode: "all", q: "users" }),
    ).toEqual({
      sort: "duration",
      q: "users",
    });
    expect(validateWaterfallSearch({ sort: "random", mode: "proxy" })).toEqual({ mode: "proxy" });
  });

  it("keeps the search as typed, a space before the next word included", () => {
    expect(validateWaterfallSearch({ q: "list " })).toEqual({ q: "list " });
    expect(validateWaterfallSearch({ q: "" })).toEqual({});
  });

  it("fills the defaults in, and leaves them out again", () => {
    const view = viewFromSearch({ group: "source" });

    expect(view).toEqual({ q: "", sort: "start", group: "source", mode: "all" });
    expect(searchFromView(view)).toEqual({ group: "source" });
  });
});

describe("a request's bar", () => {
  it("is the phases Courier measured, in order", () => {
    const r = requestEntry({ timing: { total: 100, middleware: 20, fetch: 70, validation: 10 } });

    expect(barOf(r, 0)).toEqual({
      total: 100,
      segments: [
        { key: "middleware", duration: 20 },
        { key: "fetch", duration: 70 },
        { key: "validation", duration: 10 },
      ],
    });
  });

  it("opens and closes with the caller's legs for a proxied call", () => {
    const r = requestEntry({
      mode: "proxy",
      timing,
      proxyTiming: { clientToProxy: 4, proxyToBackend: 10, backendToProxy: 50, proxyToClient: 3 },
    });

    const { segments, total } = barOf(r, 0);

    expect(segments[0]).toEqual({ key: "client-to-proxy", duration: 4 });
    expect(segments.at(-1)).toEqual({ key: "proxy-to-client", duration: 3 });
    expect(total).toBe(107);
  });

  it("is the time waited so far while in flight, and the time run once aborted", () => {
    expect(barOf(requestEntry({ status: "pending", startedAt: 1_000 }), 1_250)).toEqual({
      total: 250,
      segments: [{ key: "in-flight", duration: 250 }],
    });
    expect(
      barOf(requestEntry({ status: "aborted", timing: { ...timing, total: 40 } }), 0).segments,
    ).toEqual([{ key: "aborted", duration: 40 }]);
  });
});

describe("the window", () => {
  it("marks a stretch with nothing running as an idle gap", () => {
    const window = timeWindowOf(
      [
        { start: 0, end: 40 },
        { start: 20, end: 100 },
        { start: 2_000, end: 2_030 },
      ],
      0,
    );

    expect(window).toEqual({ start: 0, end: 2_110, gaps: [{ from: 160, to: 1_940 }] });
  });

  it("draws an idle gap narrow, and maps back to the time under the cursor", () => {
    const window = timeWindowOf(
      [
        { start: 0, end: 100 },
        { start: 5_000, end: 5_100 },
      ],
      0,
    );
    const scale = trackScaleOf(window, 1_000);
    const gap = window.gaps[0];

    expect(scale.toPx(window.start)).toBe(0);
    expect(gap && scale.toPx(gap.to) - scale.toPx(gap.from)).toBe(scale.gapPx);
    expect(scale.fromPx(scale.toPx(50)).t).toBeCloseTo(50);
    expect(gap && scale.fromPx(scale.toPx(gap.from) + 2).idle).toBe(true);
  });

  it("zooms so a typical request is legible, between 1× and 10×", () => {
    expect(autoZoomOf([{ start: 0, end: 100 }], 900)).toBe(1);
    expect(
      autoZoomOf(
        Array.from({ length: 30 }, (_, i) => ({ start: i * 200, end: i * 200 + 1 })),
        900,
      ),
    ).toBe(10);
  });
});

describe("the scale", () => {
  it("names times from the window's start", () => {
    expect([relativeTime(120, 0), relativeTime(3_950, 0), relativeTime(18_300, 0)]).toEqual([
      "+120ms",
      "+3.95s",
      "+18.3s",
    ]);
  });

  it("starts at the window's start and keeps clear of an idle gap", () => {
    const window = timeWindowOf(
      [
        { start: 0, end: 900 },
        { start: 6_000, end: 6_800 },
      ],
      0,
    );
    const scale = trackScaleOf(window, 1_200);
    const gap = window.gaps[0];
    const ticks = timeTicksOf(window, scale);

    expect(ticks[0]).toEqual({ x: 0, label: "+0ms" });
    const gapX = gap ? scale.toPx(gap.from) : 0;
    expect(ticks.every((t) => t.x <= gapX - 56 || t.x >= gapX + scale.gapPx - 1)).toBe(true);
    expect(gapMarksOf(window, scale)[0]?.title).toMatch(/^\d.*s idle · compressed$/);
  });
});

describe("what is in view", () => {
  it("is the newest fifty requests that pass the search and mode, or the ones held", () => {
    const requests = Array.from({ length: 60 }, (_, i) =>
      requestEntry({ id: `r${i}`, mode: i % 2 ? "proxy" : "direct", startedAt: 1_000 - i }),
    );

    expect(requestsInView(requests, { q: "", mode: "all" })).toHaveLength(50);
    expect(
      requestsInView(requests, { q: "", mode: "proxy" }).every((r) => r.mode === "proxy"),
    ).toBe(true);
    expect(
      requestsInView(requests, { q: "", mode: "all", held: new Set(["r59"]) }).map((r) => r.id),
    ).toEqual(["r59"]);
    expect(requestsInView(requests, { q: "nothing-like-it", mode: "all" })).toEqual([]);
    expect(requestsInView(requests, { q: " list /api ", mode: "all" })).toHaveLength(50);
  });

  it("draws a stream above them while it was open in the window", () => {
    const open = requestEntry({
      id: "open",
      transport: "sse",
      streamStatus: "streaming",
      startedAt: 0,
    });
    const old = requestEntry({
      id: "old",
      transport: "ws",
      streamStatus: "complete",
      startedAt: 0,
      streamDuration: 10,
    });

    expect(streamsInView([open, old], { q: "", mode: "all" }, 500, 1_000).map((r) => r.id)).toEqual(
      ["open"],
    );
  });
});

describe("the rows", () => {
  const items = [item("a", 0, 40), item("b", 10, 90, { mode: "proxy" }), item("c", 20, 60)];

  it("puts streams under their own header, the requests under another", () => {
    const stream = requestEntry({ id: "s", transport: "sse", streamStatus: "streaming" });

    const rows = waterfallRows({
      items,
      streams: [stream],
      sort: "start",
      group: "none",
      closed: new Set(),
    });

    expect(rows.map((r) => r.kind)).toEqual([
      "group",
      "stream",
      "group",
      "request",
      "request",
      "request",
    ]);
    expect(rows[2]).toMatchObject({
      label: "HTTP requests",
      count: 3,
      split: { direct: 2, proxy: 1 },
      aside: "avg 63ms",
    });
  });

  it("lists the requests bare with no streams, and hides the rows of a closed header", () => {
    expect(
      waterfallRows({ items, streams: [], sort: "start", group: "none", closed: new Set() }).map(
        (r) => r.kind,
      ),
    ).toEqual(["request", "request", "request"]);
    const bySource = waterfallRows({
      items,
      streams: [],
      sort: "start",
      group: "source",
      closed: new Set(["source:api"]),
    });
    expect(bySource).toEqual([
      expect.objectContaining({ kind: "group", label: "api", open: false }),
    ]);
  });

  it("sorts by start, by duration or by size", () => {
    expect(sortItems(items, "start").map((i) => i.request.id)).toEqual(["a", "b", "c"]);
    expect(sortItems(items, "duration").map((i) => i.request.id)).toEqual(["b", "c", "a"]);
  });
});

describe("the figures", () => {
  it("say how many ran at once, the slowest, and the share spent fetching", () => {
    const items = [item("a", 0, 40), item("b", 10, 90), item("c", 200, 60)];

    const insights = waterfallInsights(
      items,
      timeWindowOf(
        items.map((i) => ({ start: i.request.startedAt, end: i.request.startedAt + i.bar.total })),
        0,
      ),
    );

    expect(insights.peak).toBe(2);
    expect(insights.slowest).toEqual({ total: 90, name: "api.users.list" });
    expect(insights.fetchShare).toBeCloseTo((10 / 40 + 60 / 90 + 30 / 60) / 3);
    expect(insights.inView).toBe(3);
  });
});
