/**
 * The p95 and error rate an endpoint's row in the Explorer's Endpoints list
 * shows, in columns or stacked: coloured past the slow threshold and as
 * errors mount, `stream` for a called stream, `—` before anything is
 * measured.
 */
import { describe, expect, it } from "vitest";

import type { EndpointMetrics } from "@/features/explorer/endpoint-metrics";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { rowFiguresOf } from "@/screens/explorer/row-figures-of";

const IDLE: EndpointMetrics = {
  calls: 0,
  shared: 0,
  p50: null,
  p95: null,
  errorRate: 0,
  errors: 0,
  perMinute: 0,
  avgSize: 0,
  last: undefined,
  active: false,
};

function endpoint(
  metrics: Partial<EndpointMetrics>,
  transport: EndpointNode["transport"] = "http",
): EndpointNode {
  return {
    source: "api",
    group: "orders",
    method: "create",
    key: "api.orders.create",
    httpMethod: "POST",
    transport,
    type: "mutation",
    path: "/orders",
    url: "https://api.example.com/orders",
    middleware: [],
    hasVariablesSchema: true,
    hasResponseSchema: true,
    trafficOnly: false,
    proxied: false,
    requests: [],
    metrics: { ...IDLE, ...metrics },
    level: "healthy",
  };
}

describe("rowFiguresOf", () => {
  it("says nothing was measured before any call", () => {
    expect(rowFiguresOf(endpoint({}), 500)).toEqual({
      p95: { text: "—", className: "text-fg-subtle" },
      errors: { text: "—", className: "text-fg-subtle" },
    });
  });

  it("colours the p95 amber past the slow threshold and red past twice it", () => {
    expect(rowFiguresOf(endpoint({ calls: 3, p95: 120 }), 500).p95.className).toBe("text-fg");
    expect(rowFiguresOf(endpoint({ calls: 3, p95: 700 }), 500).p95.className).toBe("text-warn");
    expect(rowFiguresOf(endpoint({ calls: 3, p95: 1_200 }), 500).p95).toEqual({
      text: "1.20s",
      className: "text-err",
    });
  });

  it("names a called stream, which has no p95", () => {
    expect(rowFiguresOf(endpoint({ calls: 2 }, "sse"), 500).p95.text).toBe("stream");
  });

  it("colours the error rate amber from 5% and red from 20%", () => {
    const rate = (errorRate: number) =>
      rowFiguresOf(endpoint({ calls: 10, p95: 80, errorRate }), 500).errors;

    expect(rate(0)).toEqual({ text: "0.0%", className: "text-fg-subtle" });
    expect(rate(7.5).className).toBe("text-warn");
    expect(rate(25)).toEqual({ text: "25.0%", className: "text-err" });
  });
});
