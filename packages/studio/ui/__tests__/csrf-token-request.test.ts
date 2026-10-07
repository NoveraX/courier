/**
 * The request a session makes for a write — the double-submit token asked
 * for before it — in Studio: kept from its event as a request of its own,
 * listed with the traffic, and taken for none of the API's endpoints.
 */
import { describe, expect, it } from "vitest";

import { buildCatalogFromRequests } from "@/store/build-catalog-from-requests";
import { requestFromStart } from "@/store/handle-request-events";
import { requestEntry } from "./request-entry-fixture";

describe("the double-submit token's request", () => {
  it("keeps what it is from its event", () => {
    const entry = requestFromStart({
      id: "r1",
      type: "request:start",
      source: "accounts",
      method: "csrf token",
      httpMethod: "GET",
      purpose: "csrf-token",
      mode: "direct",
      middlewareCount: 0,
      timestamp: 1,
    });

    expect(entry).toMatchObject({ method: "csrf token", purpose: "csrf-token" });
  });

  it("names none of the API's endpoints in the catalogue", () => {
    const catalog = buildCatalogFromRequests([
      requestEntry({
        source: "accounts",
        group: undefined,
        method: "csrf token",
        purpose: "csrf-token",
      }),
      requestEntry({ source: "accounts", group: undefined, method: "rename", httpMethod: "POST" }),
    ]);

    expect(Object.keys(catalog.accounts?.groups[""]?.endpoints ?? {})).toEqual(["rename"]);
  });
});
