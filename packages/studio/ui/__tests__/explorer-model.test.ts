/**
 * What the Explorer shows, as data: each endpoint's metrics and health, the
 * tree of sources, groups and endpoints the project defines, the figure a
 * node shows under each metric, the graph's layout, the Endpoints tab's
 * rows, the heatmap and the Overview's figures.
 */
import { describe, expect, it } from "vitest";

import { latencyBars, recentCalls } from "@/features/explorer/endpoint-detail";
import { endpointKey, keyParts, lastCallLabel, shortAgo } from "@/features/explorer/endpoint-key";
import { levelOf, metricsOf } from "@/features/explorer/endpoint-metrics";
import { endpointTags } from "@/features/explorer/endpoint-tags";
import { endpointRows, kindCounts } from "@/features/explorer/endpoints-table";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { explorerModelOf } from "@/features/explorer/explorer-model";
import { graphLayoutOf } from "@/features/explorer/graph-layout";
import { heatmapOf, heatStep } from "@/features/explorer/heatmap-model";
import { methodLabelOf } from "@/features/explorer/method-label";
import { metricValue } from "@/features/explorer/metric-value";
import { nodeFiguresOf } from "@/features/explorer/node-figures";
import { overviewFigures, topEndpoints } from "@/features/explorer/overview-model";
import { axisMark, heatCellText, heatTotalText } from "@/screens/explorer/heat-format";
import type { Catalog, CatalogEndpoint, RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

const NOW = 1_000_000;

function def(extra: Partial<CatalogEndpoint> = {}): CatalogEndpoint {
  return {
    type: "query",
    hasVariablesSchema: true,
    hasResponseSchema: true,
    origin: "scan",
    ...extra,
  };
}

const CATALOG: Catalog = {
  api: {
    baseURL: "https://api.example.com/",
    groups: {
      orders: {
        prefix: "/orders",
        endpoints: {
          create: def({
            type: "mutation",
            httpMethod: "post",
            path: "",
            middleware: ["auth", "logger"],
          }),
          list: def({ path: "/" }),
        },
      },
      events: {
        prefix: "events",
        endpoints: { subscribe: def({ transport: "sse", path: "/live" }) },
      },
      "": { prefix: "", endpoints: { health: def({ path: "health" }) } },
    },
  },
  billing: {
    baseURL: "https://billing.example.com",
    groups: { invoices: { prefix: "/invoices", endpoints: { get: def({ path: "/:id" }) } } },
  },
};

function call(group: string, method: string, extra: Partial<RequestEntry> = {}): RequestEntry {
  return requestEntry({
    source: "api",
    group: group || undefined,
    method,
    startedAt: NOW - 1_000,
    timing: { total: 100, middleware: 10, fetch: 85, validation: 5 },
    ...extra,
  });
}

const REQUESTS: RequestEntry[] = [
  call("orders", "create", { id: "c3", startedAt: NOW - 1_000, mode: "proxy", size: 300 }),
  call("orders", "create", {
    id: "c2",
    startedAt: NOW - 30_000,
    status: "error",
    statusCode: 500,
    timing: { total: 900, middleware: 10, fetch: 885, validation: 5 },
  }),
  call("orders", "create", { id: "c1", startedAt: NOW - 60_000, size: 100 }),
  call("events", "subscribe", {
    id: "s1",
    transport: "sse",
    streamStatus: "streaming",
    startedAt: NOW - 50_000,
  }),
];

const model = explorerModelOf(CATALOG, REQUESTS, NOW, 500);
const create = model.endpoints.find((e) => e.key === "api.orders.create");

describe("an endpoint's metrics", () => {
  it("count its finished calls, their durations, failures, pace and size, and its newest call", () => {
    const m = metricsOf(REQUESTS.slice(0, 3), NOW, NOW - 60_000);

    expect(m).toMatchObject({
      calls: 3,
      p50: 100,
      p95: 900,
      errors: 1,
      perMinute: 3,
      avgSize: 200,
      last: NOW - 1_000,
    });
    expect(m.errorRate).toBeCloseTo(33.33, 1);
    expect(m.active).toBe(true);
  });

  it("read as no traffic, healthy, degraded or critical", () => {
    const base = metricsOf([], NOW, NOW);
    expect(levelOf(base, 500)).toBe("idle");
    expect(levelOf({ ...base, calls: 10, p95: 200, errorRate: 0 }, 500)).toBe("healthy");
    expect(levelOf({ ...base, calls: 10, p95: 600, errorRate: 0 }, 500)).toBe("degraded");
    expect(levelOf({ ...base, calls: 10, p95: 200, errorRate: 25 }, 500)).toBe("critical");
  });
});

describe("the tree", () => {
  it("holds every source, group and endpoint, the largest source first", () => {
    expect(model.sources.map((s) => s.name)).toEqual(["api", "billing"]);
    expect(model.sources[0]?.groups.map((g) => g.name)).toEqual(["events", "orders"]);
    expect(model.sources[0]?.loose.map((e) => e.key)).toEqual(["api.health"]);
    expect(model.endpoints).toHaveLength(5);
  });

  it("joins each endpoint's path and URL, and reads its method, transport and calls", () => {
    expect(create).toMatchObject({
      httpMethod: "POST",
      path: "/orders",
      url: "https://api.example.com/orders",
      proxied: true,
      middleware: ["auth", "logger"],
    });
    expect(create?.requests.map((r) => r.id)).toEqual(["c3", "c2", "c1"]);
    expect(model.endpoints.find((e) => e.key === "api.events.subscribe")).toMatchObject({
      transport: "sse",
      path: "/events/live",
    });
    expect(model.endpoints.find((e) => e.key === "billing.invoices.get")?.level).toBe("idle");
  });

  it("names an endpoint outside any group by its source and method", () => {
    expect(endpointKey({ source: "api", group: "", method: "health" })).toBe("api.health");
  });

  it("counts calls that carry no group, or an empty one, toward an endpoint outside any group", () => {
    const flat = explorerModelOf(
      CATALOG,
      [call("", "health", { id: "h1" }), call("", "health", { id: "h2", group: "" })],
      NOW,
      500,
    );

    expect(flat.endpoints.find((e) => e.key === "api.health")?.requests.map((r) => r.id)).toEqual([
      "h1",
      "h2",
    ]);
  });
});

describe("a node's figure", () => {
  it("shows the metric the Explorer colours by, in its tone", () => {
    const m = create?.metrics ?? metricsOf([], NOW, NOW);

    expect(metricValue(m, "latency", 500)).toEqual({ text: "900ms", tone: "warn" });
    expect(metricValue(m, "errors", 500)).toEqual({ text: "33.3%", tone: "err" });
    expect(metricValue(m, "traffic", 500).text).toMatch(/\/m$/);
    expect(metricValue(metricsOf([], NOW, NOW), "size", 500)).toEqual({ text: "—", tone: "muted" });
  });
});

describe("the graph", () => {
  const options = {
    metric: "latency",
    slowMs: 500,
    query: "",
    hover: undefined,
    selected: undefined,
  } as const;

  it("lays out a node per source, group and endpoint, and a curve into each group and endpoint", () => {
    const layout = graphLayoutOf(model, options);

    expect(layout.nodes).toHaveLength(2 + 3 + 5);
    expect(layout.edges).toHaveLength(3 + 5);
    expect(layout.columns.map((c) => c.label)).toEqual([
      "Sources · 2",
      "Groups · 3",
      "Endpoints · 5",
    ]);
  });

  it("centres a group on its endpoints, and dims what is off the hovered branch or the search", () => {
    const layout = graphLayoutOf(model, { ...options, hover: "g:api.orders", query: "create" });
    const node = (id: string) => layout.nodes.find((n) => n.id === id);
    const centre = (id: string) => {
      const n = node(id);
      return n ? n.y + n.height / 2 : Number.NaN;
    };

    expect(centre("g:api.orders")).toBe(
      (centre("e:api.orders.create") + centre("e:api.orders.list")) / 2,
    );
    expect(node("e:api.orders.create")?.dim).toBe(false);
    expect(node("e:api.orders.list")?.dim).toBe(true);
    expect(node("s:billing")?.dim).toBe(true);
  });
});

describe("the Endpoints tab", () => {
  it("lists each source's matching endpoints under it, and counts each kind", () => {
    expect(
      endpointRows(model, "orders", "all").map((r) =>
        r.kind === "source" ? r.source.name : r.endpoint.key,
      ),
    ).toEqual(["api", "api.orders.create", "api.orders.list"]);
    expect(kindCounts(model)).toEqual({ all: 5, query: 3, mutation: 1, stream: 1 });
  });

  it("says how long ago compactly", () => {
    expect([shortAgo(5_000), shortAgo(125_000), shortAgo(7_200_000)]).toEqual(["5s", "2m", "2h"]);
  });
});

describe("the heatmap", () => {
  it("splits each called HTTP endpoint's calls over the session into twenty spans", () => {
    const heat = heatmapOf(model, "latency");

    expect(heat.rows.map((r) => r.endpoint.key)).toEqual(["api.orders.create"]);
    expect(heat.rows[0]?.cells).toHaveLength(20);
    expect(heat.rows[0]?.cells.filter((c) => c !== null)).toHaveLength(3);
  });

  it("steps durations against the slow threshold, from good to bad", () => {
    expect([100, 300, 600, 1_200].map((v) => heatStep(v, "latency", 500))).toEqual([0, 1, 2, 3]);
    expect(heatStep(null, "errors", 500)).toBeNull();
  });
});

describe("the Overview", () => {
  it("gives six figures, and ranks the slowest endpoints", () => {
    const figures = overviewFigures(model, REQUESTS, "courier.config.ts");

    expect(figures.map((f) => [f.label, f.value])).toEqual([
      ["Sources", "2"],
      ["Groups", "3"],
      ["Endpoints", "5"],
      ["Active now", "2"],
      ["Healthy", "50%"],
      ["Error rate", "25.0%"],
    ]);
    expect(figures[0]?.sub).toBe("from courier.config.ts");
    expect(topEndpoints(model, "latency").map((t) => t.endpoint.key)).toEqual([
      "api.orders.create",
    ]);
  });
});

function endpointNamed(key: string): EndpointNode {
  const found = model.endpoints.find((e) => e.key === key);
  if (!found) throw new Error(`no endpoint ${key}`);
  return found;
}

describe("an endpoint's panel", () => {
  it("charts its finished HTTP calls oldest first, each against the longest", () => {
    const orders = endpointNamed("api.orders.create");
    const withPending = {
      ...orders,
      requests: [call("orders", "create", { id: "p", status: "pending" }), ...orders.requests],
    };
    expect(withPending.requests).toHaveLength(4);

    const bars = latencyBars(withPending);

    expect(bars.map((b) => b.request.id)).toEqual(["c1", "c2", "c3"]);
    expect(bars.map((b) => b.share)).toEqual([100 / 900, 1, 100 / 900]);
    expect(bars.map((b) => b.failed)).toEqual([false, true, false]);
  });

  it("lists its newest calls, a stream filling its bar", () => {
    const subscribe = endpointNamed("api.events.subscribe");

    expect(
      recentCalls(endpointNamed("api.orders.create")).map((c) => [c.request.id, c.share]),
    ).toEqual([
      ["c3", 100 / 900],
      ["c2", 1],
      ["c1", 100 / 900],
    ]);
    expect(recentCalls(subscribe)[0]).toMatchObject({ state: "streaming", share: 1 });
  });

  it("tags its kind, then proxy, then an undeclared response", () => {
    const get = endpointNamed("billing.invoices.get");

    expect(endpointTags(endpointNamed("api.orders.create")).map((t) => t.label)).toEqual([
      "mutation",
      "proxy",
    ]);
    expect(endpointTags({ ...get, hasResponseSchema: false }).map((t) => t.label)).toEqual([
      "query",
      "untyped response",
    ]);
  });

  it("names it and its method, and says when it was last called", () => {
    expect(keyParts({ source: "api", group: "orders", method: "create" })).toEqual({
      source: "api",
      rest: "orders.create",
    });
    expect(methodLabelOf({ transport: "ws", httpMethod: "GET" })).toBe("WS");
    expect([
      lastCallLabel(undefined, NOW),
      lastCallLabel(NOW - 400, NOW),
      lastCallLabel(NOW - 57_000, NOW),
    ]).toEqual(["never", "just now", "57s ago"]);
  });
});

describe("the heatmap's words", () => {
  it("say a span's value, a row's total and the time before now", () => {
    expect([
      heatCellText(null, "latency"),
      heatCellText(812, "latency"),
      heatCellText(1, "traffic"),
    ]).toEqual(["no calls", "812ms p95", "1 call"]);
    expect([heatTotalText(null, "errors"), heatTotalText(7.66, "errors")]).toEqual(["—", "7.7%"]);
    expect([axisMark(221_000), axisMark(55_000)]).toEqual(["−3m 41s", "−55s"]);
  });
});

describe("a call's way across the graph", () => {
  const options = {
    metric: "latency",
    slowMs: 500,
    query: "",
    hover: undefined,
    selected: undefined,
  } as const;

  it("runs from its source's card into its group's, and on out of it to its endpoint's", () => {
    const layout = graphLayoutOf(model, options);
    const centre = (id: string) => {
      const n = layout.nodes.find((node) => node.id === id);
      if (!n) throw new Error(`no node ${id}`);
      return { left: n.x, right: n.x + n.width, y: n.y + n.height / 2, width: n.width };
    };
    const [source, group, end] = ["s:api", "g:api.orders", "e:api.orders.create"].map(centre);
    const branch = layout.branches.get("api.orders.create");

    expect(branch?.path.startsWith(`M${source?.right} ${source?.y} `)).toBe(true);
    expect(branch?.path).toContain(` M${group?.right} ${group?.y} `);
    expect(branch?.path.endsWith(` ${end?.left} ${end?.y}`)).toBe(true);
    expect(branch?.length).toBeLessThan((end?.left ?? 0) - (source?.right ?? 0));
    expect([...layout.branches.keys()].sort()).toEqual(model.endpoints.map((e) => e.key).sort());
  });
});

describe("a graph node's figures on hover", () => {
  it("give its calls a minute, its median and p95, and the share that failed", () => {
    const m = metricsOf(
      [call("orders", "create"), call("orders", "create", { status: "error" })],
      NOW,
      NOW - 60_000,
    );

    expect(nodeFiguresOf(m, 500).map((f) => [f.label, f.tone])).toEqual([
      ["Calls", "normal"],
      ["p50", "ok"],
      ["p95", "ok"],
      ["Errors", "err"],
    ]);
    expect(nodeFiguresOf(metricsOf([], NOW, NOW), 500)).toEqual([]);
  });
});
