import { describe, expect, it } from "vitest";

import { computeTimingBreakdown } from "@/views/explorer/heatmap/compute-heatmap";
import type { RequestEntry } from "@/store/types";
import type { EndpointNodeData } from "@/views/explorer/types";

const endpoint = {
  source: "api",
  group: "",
  method: "createTodo",
  httpMethod: "POST",
  endpointType: "query",
} as EndpointNodeData;

function request(total: number, fetch: number): RequestEntry {
  return {
    source: "api",
    method: "createTodo",
    timing: { total, fetch, middleware: 0, validation: 0 },
  } as RequestEntry;
}

describe("computeTimingBreakdown", () => {
  it("keeps the phases of an endpoint that answers in microseconds", () => {
    /* 500µs total, 420µs of it fetch — every phase sits below a millisecond,
       and a row left with no phases renders as "No timing data". */
    const [group] = computeTimingBreakdown([endpoint], [request(0.5, 0.42)], "total");
    const row = group?.rows[0];

    expect(row?.sampleCount).toBe(1);
    expect(row?.phases.length).toBeGreaterThan(0);
    expect(row?.bottleneck).toBe("fetch");
  });

  it("still drops a phase that is a sliver of the bar", () => {
    const [group] = computeTimingBreakdown([endpoint], [request(100, 99.8)], "total");
    const row = group?.rows[0];

    expect(row?.phases.map((p) => p.key)).toEqual(["fetch"]);
  });

  it("reports no samples for an endpoint that was never called", () => {
    const [group] = computeTimingBreakdown([endpoint], [], "total");

    expect(group?.rows[0]?.sampleCount).toBe(0);
    expect(group?.rows[0]?.phases).toEqual([]);
  });
});
