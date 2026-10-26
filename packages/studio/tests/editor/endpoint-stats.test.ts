/**
 * How an endpoint's calls went, as an editor shows it beside a call: its
 * latest failure says why, as the request's own line in the editor's list
 * says it — for a request that got no answer, the system's code and text.
 */
import { describe, expect, it } from "vitest";

import type { CatalogEndpoint } from "../../src/server/editor/endpoint-catalog";
import { endpointStats } from "../../src/server/editor/endpoint-stats";

const CATALOG: readonly CatalogEndpoint[] = [
  { source: "shop", endpoint: "orders.place", parts: ["orders", "place"], kind: "mutation" },
];

function failedWith(error: Record<string, unknown>, status?: number) {
  const [stats] = endpointStats(
    [
      {
        type: "request:start",
        id: "r1",
        source: "shop",
        group: "orders",
        method: "place",
        mode: "direct",
        timestamp: 1,
      },
      {
        type: "request:error",
        id: "r1",
        requestId: "r1",
        error,
        ...(status !== undefined && { status }),
        timestamp: 2,
      },
    ],
    CATALOG,
  );
  return stats?.lastFailure;
}

describe("an endpoint's latest failure", () => {
  it("says why its request got no answer, the code where the text does not name it", () => {
    expect(
      failedWith({
        type: "unknown",
        message: "fetch failed",
        cause: {
          code: "UND_ERR_CONNECT_TIMEOUT",
          message: "Connect Timeout Error (attempted address: api.test:443, timeout: 10000ms)",
        },
      }),
    ).toEqual({
      at: 1,
      message:
        "fetch failed — UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.test:443, timeout: 10000ms)",
      request: "r1",
    });
  });

  it("is what an answered request failed with, and its status", () => {
    expect(failedWith({ type: "http", status: 500, message: "Ledger unavailable" }, 500)).toEqual({
      at: 1,
      status: 500,
      message: "Ledger unavailable",
      request: "r1",
    });
  });

  it("is said to have failed when the failure carries no text", () => {
    expect(failedWith({ type: "unknown" })).toEqual({ at: 1, message: "Failed", request: "r1" });
  });
});
