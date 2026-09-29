/**
 * The Timeline's search finds a request by the dotted name its row shows —
 * `api.users.create` — and by any part of it. Each field used to be matched
 * on its own, so only a single word ("create") found anything.
 */
import { describe, expect, it } from "vitest";

import type { RequestEntry } from "@/store";
import { EMPTY_FILTERS } from "@/store/constants";
import { filterRequests } from "@/views/timeline/filters";

function request(id: string, group: string | undefined, method: string): RequestEntry {
  return {
    id,
    source: "api",
    group,
    method,
    variables: undefined,
    mode: "direct",
    status: "success",
    statusCode: 201,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1,
    url: "http://upstream.test/users",
    sessionId: "s",
  };
}

const REQUESTS = [
  request("a", "users", "create"),
  request("b", "users", "list"),
  request("c", undefined, "health"),
];

const search = (query: string) =>
  filterRequests(REQUESTS, { ...EMPTY_FILTERS, search: query }).map((r) => r.id);

describe("searching the Timeline", () => {
  it("finds a request by its full dotted name", () => {
    expect(search("api.users.create")).toEqual(["a"]);
  });

  it("finds a request by the end of its dotted name", () => {
    expect(search("users.create")).toEqual(["a"]);
  });

  it("finds an ungrouped request by its dotted name", () => {
    expect(search("api.health")).toEqual(["c"]);
  });

  it("still finds by a single part, the URL and the status code", () => {
    expect(search("create")).toEqual(["a"]);
    expect(search("upstream.test")).toEqual(["a", "b", "c"]);
    expect(search("201")).toEqual(["a", "b", "c"]);
  });

  it("ignores the letter case of the query", () => {
    expect(search("API.Users.Create")).toEqual(["a"]);
  });
});
