import { describe, expect, it } from "vitest";
import type { RequestEntry } from "@/store/types";
import { filterRequests } from "@/views/explorer/helpers";

/**
 * A source that declares no groups keys its endpoints under `""`, while the
 * requests those endpoints produce carry no group at all. Both spellings mean
 * the same thing and have to match, or every per-endpoint metric for the
 * simplest kind of source reads zero.
 */
function request(over: Partial<RequestEntry> = {}): RequestEntry {
  return {
    source: "api",
    method: "slow",
    ...over,
  } as RequestEntry;
}

describe("filterRequests", () => {
  it('matches ungrouped requests against the catalogue\'s "" group', () => {
    const requests = [request(), request({ method: "listTodos" })];

    expect(filterRequests(requests, "api", "", "slow")).toHaveLength(1);
  });

  it('matches requests that spell the flat group as ""', () => {
    const requests = [request({ group: "" })];

    expect(filterRequests(requests, "api", "", "slow")).toHaveLength(1);
  });

  it("still keeps a named group apart from the flat one", () => {
    const requests = [request({ group: "todos" }), request()];

    expect(filterRequests(requests, "api", "todos", "slow")).toHaveLength(1);
    expect(filterRequests(requests, "api", "", "slow")).toHaveLength(1);
  });

  it("matches every group when none is given", () => {
    const requests = [request({ group: "todos" }), request()];

    expect(filterRequests(requests, "api", undefined, "slow")).toHaveLength(2);
  });

  it("matches the source case-insensitively", () => {
    expect(filterRequests([request({ source: "API" })], "api", "", "slow")).toHaveLength(1);
  });
});
