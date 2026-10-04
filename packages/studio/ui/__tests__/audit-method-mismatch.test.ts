/**
 * The audit's HTTP method rule. A read sent over another verb than GET is
 * one `.reads()` declared on purpose — a search sent as POST — so the rule
 * does not tell it to use GET.
 */
import { describe, expect, it } from "vitest";

import type { Catalog } from "@/store/types-ui";
import { collectWarnings } from "../src/views/audit/rules-warnings";
import type { EndpointStats } from "../src/views/audit/types";

function stats(type: "query" | "mutation", method: string): EndpointStats {
  return {
    key: `api.users.${type}`,
    source: "api",
    group: "users",
    method: type,
    avgDuration: 10,
    p95: 10,
    errorRate: 0,
    count: 1,
    sizes: [10],
    avgSize: 10,
    hasVariablesValidation: true,
    hasResponseValidation: true,
    sentVariables: true,
    modes: new Set(["direct"]),
    statusCodes: [200],
    middlewareOverhead: 0,
    validationOverhead: 0,
    proxyOverhead: 0,
    httpMethods: new Set([method]),
    type,
    requestIds: ["r1"],
    cached: false,
  };
}

function mismatches(endpoint: EndpointStats): string[] {
  const catalog: Catalog = {};
  return collectWarnings(new Map([[endpoint.key, endpoint]]), catalog, [])
    .filter((item) => item.id === "warn-method-mismatch")
    .flatMap((item) => (item.endpoints ?? []).map((e) => e.key));
}

describe("the HTTP method rule", () => {
  it("leaves a read sent over POST alone, as .reads() declares one", () => {
    expect(mismatches(stats("query", "POST"))).toEqual([]);
  });

  it("warns of a write sent over GET", () => {
    expect(mismatches(stats("mutation", "GET"))).toEqual(["api.users.mutation"]);
  });
});
