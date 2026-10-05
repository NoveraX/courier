/**
 * The audit's validation hints name only endpoints that lack a schema: one
 * a stream or a channel declares counts though its calls report none, and an
 * endpoint whose calls send no variables has nothing to validate.
 */
import { describe, expect, it } from "vitest";
import { computeEndpointStats } from "@/features/audit/compute-stats";
import { noResponseValidation, noVariablesValidation } from "@/features/audit/hints-validation";
import type { RequestEntry } from "@/store/types";
import type { Catalog, CatalogEndpoint } from "@/store/types-ui";

function request(group: string, method: string, fields: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id: `${group}.${method}`,
    source: "api",
    group,
    method,
    variables: undefined,
    mode: "direct",
    status: "success",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1,
    sessionId: "s",
    ...fields,
  };
}

function endpoint(fields: Partial<CatalogEndpoint>): CatalogEndpoint {
  return {
    type: "query",
    hasVariablesSchema: false,
    hasResponseSchema: false,
    origin: "both",
    ...fields,
  };
}

const CATALOG: Catalog = {
  api: {
    baseURL: "http://localhost:4401",
    groups: {
      users: {
        prefix: "users",
        endpoints: {
          list: endpoint({ hasResponseSchema: true }),
          get: endpoint({ hasVariablesSchema: true, hasResponseSchema: true }),
          search: endpoint({}),
        },
      },
      live: {
        prefix: "live",
        endpoints: {
          ticks: endpoint({
            type: undefined,
            transport: "sse",
            hasVariablesSchema: true,
            hasResponseSchema: true,
          }),
        },
      },
    },
  },
};

const REQUESTS = [
  request("users", "list", { hasValidation: { variables: false, response: true } }),
  request("users", "get", {
    variables: { id: 2 },
    hasValidation: { variables: true, response: true },
  }),
  request("users", "search", { variables: { q: "ada" } }),
  request("live", "ticks", { transport: "sse" }),
];

function named(items: ReturnType<typeof noVariablesValidation>): string[] {
  return items.flatMap((item) => (item.endpoints ?? []).map((e) => e.label));
}

describe("the audit's validation hints", () => {
  it("ask for an input schema only where calls sent variables without one", () => {
    const stats = computeEndpointStats(REQUESTS);

    expect(named(noVariablesValidation(stats, CATALOG))).toEqual(["api.users.search"]);
  });

  it("ask for a response schema only where neither a call nor the catalog has one", () => {
    const stats = computeEndpointStats(REQUESTS);

    expect(named(noResponseValidation(stats, CATALOG))).toEqual(["api.users.search"]);
  });
});
