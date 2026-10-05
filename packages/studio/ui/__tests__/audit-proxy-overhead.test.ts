/**
 * The audit's proxy-overhead hint, given proxied calls as Studio holds
 * them: the server's total covers its own run, and the trips to and from
 * the proxy, which the browser measures, come on top — so their share is of
 * the whole call and never passes 100%.
 */
import { describe, expect, it } from "vitest";

import { computeEndpointStats } from "@/features/audit/compute-stats";
import { proxyLatencyOverhead } from "@/features/audit/hints-performance";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

function proxied(id: string, total: number, out: number, back: number): RequestEntry {
  return requestEntry({
    id,
    mode: "proxy",
    timing: { total, middleware: 0, fetch: total, validation: 0 },
    proxyTiming: {
      clientToProxy: out,
      proxyToBackend: total,
      backendToProxy: 0,
      proxyToClient: back,
    },
  });
}

describe("the proxy overhead", () => {
  it("is the trips' share of the whole call, so trips as long as the server's run read as half", () => {
    const stats = computeEndpointStats([proxied("a", 100, 50, 51)]);
    const [item] = proxyLatencyOverhead(stats);

    expect(stats.get("api:users:list")?.proxyOverhead).toBeCloseTo(101 / 201);
    expect(item?.endpoints?.[0]?.detail).toBe("50% in proxy trips");
  });

  it("is not raised while the trips take less than half the server's own time", () => {
    const stats = computeEndpointStats([proxied("a", 100, 20, 20)]);

    expect(proxyLatencyOverhead(stats)).toEqual([]);
  });
});
