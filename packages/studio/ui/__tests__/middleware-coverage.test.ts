/**
 * Which endpoints each middleware covers, read from the definitions: a
 * middleware no call has run through yet is counted too, two of one name
 * declared apart are two rows, the endpoints that run through none are
 * listed, and the count narrows to one source.
 */
import { describe, expect, it } from "vitest";

import { middlewareCoverage } from "../src/features/middleware/middleware-coverage";
import type { MiddlewareStat } from "../src/features/middleware/middleware-stats";
import type { Catalog, CatalogEndpoint } from "../src/store/types-ui";

function endpoint(chain: CatalogEndpoint["chain"], overrides: Partial<CatalogEndpoint> = {}) {
  return {
    type: "query" as const,
    hasVariablesSchema: false,
    hasResponseSchema: false,
    httpMethod: "GET",
    origin: "scan" as const,
    ...(chain && { chain, middleware: chain.map((step) => step.name) }),
    ...overrides,
  };
}

const CATALOG: Catalog = {
  shop: {
    baseURL: "https://shop.example",
    groups: {
      orders: {
        prefix: "orders",
        endpoints: {
          list: endpoint([
            { name: "auth", layer: "api" },
            { name: "tenant", layer: "endpoint" },
          ]),
          place: endpoint(
            [
              { name: "auth", layer: "api" },
              { name: "retry", layer: "retry" },
              { name: "tenant", layer: "endpoint" },
              { name: "auth", layer: "endpoint" },
            ],
            { httpMethod: "POST", type: "mutation" },
          ),
          ping: endpoint([{ name: "auth", layer: "api" }]),
        },
      },
    },
  },
  status: {
    baseURL: "https://status.example",
    groups: {
      "": {
        prefix: "",
        endpoints: {
          health: endpoint(undefined),
          seen: endpoint(undefined, { origin: "runtime" }),
        },
      },
    },
  },
};

const STATS: MiddlewareStat[] = [
  {
    name: "auth",
    phase: "before",
    calls: 12,
    avg: 1,
    p95: 2,
    total: 12,
    errors: 1,
    headersAdded: [],
    share: 0.5,
  },
];

describe("which endpoints each middleware covers", () => {
  it("counts each middleware declared anywhere, in the order a call meets them", () => {
    const coverage = middlewareCoverage(CATALOG, STATS);

    expect(coverage.total).toBe(4);
    expect(coverage.rows.map((row) => [row.key, row.endpoints.length])).toEqual([
      ["api:auth", 3],
      ["retry:retry", 1],
      ["endpoint:tenant", 2],
      ["endpoint:auth", 1],
    ]);
  });

  it("gives a middleware no call ran through yet no calls, and the others theirs by name", () => {
    const rows = middlewareCoverage(CATALOG, STATS).rows;

    expect(rows.find((row) => row.key === "endpoint:tenant")).toMatchObject({
      calls: 0,
      errors: 0,
    });
    expect(rows.find((row) => row.key === "api:auth")).toMatchObject({ calls: 12, errors: 1 });
  });

  it("lists the declared endpoints that run through none, and leaves out one seen only in traffic", () => {
    const { uncovered } = middlewareCoverage(CATALOG, STATS);

    expect(uncovered.map((e) => `${e.source}.${e.method}`)).toEqual(["status.health"]);
  });

  it("narrows to one source, offering every source with declared endpoints", () => {
    const coverage = middlewareCoverage(CATALOG, STATS, "status");

    expect(coverage.total).toBe(1);
    expect(coverage.rows).toEqual([]);
    expect(coverage.sources).toEqual(["shop", "status"]);
  });

  it("counts an endpoint once for a middleware it runs through twice", () => {
    const twice: Catalog = {
      shop: {
        baseURL: "https://shop.example",
        groups: {
          "": {
            prefix: "",
            endpoints: {
              list: endpoint([
                { name: "log", layer: "endpoint" },
                { name: "log", layer: "endpoint" },
              ]),
            },
          },
        },
      },
    };

    expect(middlewareCoverage(twice, []).rows[0]?.endpoints).toHaveLength(1);
  });
});
