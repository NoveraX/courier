/**
 * What the new Timeline shows: a quick view — the failures, the slow, the
 * unfinished — the values chosen in each filter, and a search over a
 * row's name, URL, code, method, state and transport; each filter's
 * options counted as choosing them would show, and all of it carried in
 * the address.
 */
import { describe, expect, it } from "vitest";

import { filterOptions, selectionSummary, viewCounts } from "@/features/requests/filter-options";
import {
  activeFilterCount,
  dimensionValue,
  matchesFilter,
  NO_SELECTION,
  OPEN_FILTER,
} from "@/features/requests/timeline-filter";
import {
  filterFromSearch,
  searchFromFilter,
  validateTimelineSearch,
} from "@/features/requests/timeline-search";
import { requestEntry } from "./request-entry-fixture";

const SLOW = { slowMs: 500 };
const ok = requestEntry({ id: "ok" });
const slow = requestEntry({
  id: "slow",
  timing: { total: 900, middleware: 0, fetch: 900, validation: 0 },
});
const failed = requestEntry({
  id: "failed",
  status: "error",
  statusCode: 503,
  method: "create",
  httpMethod: "POST",
});
const broken = requestEntry({
  id: "broken",
  status: "validation_error",
  source: "search",
  group: undefined,
});
const pending = requestEntry({ id: "pending", status: "pending", timing: undefined });
const stream = requestEntry({
  id: "stream",
  transport: "sse",
  streamStatus: "streaming",
  mode: "proxy",
});
const ALL = [ok, slow, failed, broken, pending, stream];

const shown = (filter = OPEN_FILTER) =>
  ALL.filter((r) => matchesFilter(r, filter, SLOW)).map((r) => r.id);

describe("the quick views", () => {
  it("show the failures, the slow, and what has not finished", () => {
    expect(shown({ ...OPEN_FILTER, view: "errors" })).toEqual(["failed", "broken"]);
    expect(shown({ ...OPEN_FILTER, view: "slow" })).toEqual(["slow"]);
    expect(shown({ ...OPEN_FILTER, view: "pending" })).toEqual(["pending", "stream"]);
    expect(shown()).toHaveLength(6);
  });

  it("are counted given the filters chosen", () => {
    const proxied = { ...OPEN_FILTER, selected: { ...NO_SELECTION, mode: ["proxy"] } };

    expect(viewCounts(ALL, OPEN_FILTER, 500)).toEqual({ all: 6, errors: 2, slow: 1, pending: 2 });
    expect(viewCounts(ALL, proxied, 500)).toEqual({ all: 1, errors: 0, slow: 0, pending: 1 });
  });
});

describe("the filters", () => {
  it("let through only the values chosen, in every filter at once", () => {
    const filter = {
      ...OPEN_FILTER,
      selected: { ...NO_SELECTION, method: ["POST"], status: ["error"] },
    };

    expect(shown(filter)).toEqual(["failed"]);
  });

  it("read a request's value: its state, http for no transport, query for no type, empty for no group", () => {
    expect(dimensionValue(stream, "status")).toBe("streaming");
    expect(dimensionValue(ok, "transport")).toBe("http");
    expect(dimensionValue(requestEntry({ type: undefined }), "type")).toBe("query");
    expect(dimensionValue(broken, "group")).toBe("");
  });

  it("offer their known values in order, then the others seen, counted without their own choice", () => {
    const filter = { ...OPEN_FILTER, selected: { ...NO_SELECTION, source: ["search"] } };

    const sources = filterOptions(ALL, filter, "source", 500);
    const statuses = filterOptions(ALL, OPEN_FILTER, "status", 500);
    const groups = filterOptions(ALL, OPEN_FILTER, "group", 500);

    expect(sources).toEqual([
      { value: "api", label: "api", count: 5 },
      { value: "search", label: "search", count: 1 },
    ]);
    expect(statuses.map((o) => [o.value, o.count])).toEqual([
      ["success", 2],
      ["error", 1],
      ["validation_error", 1],
      ["pending", 1],
      ["aborted", 0],
      ["streaming", 1],
      ["closed", 0],
    ]);
    expect(groups.find((o) => o.value === "")?.label).toBe("no group");
  });

  it("are summed up by name, two at most", () => {
    const methods = filterOptions(ALL, OPEN_FILTER, "method", 500);

    expect(selectionSummary(methods, ["GET"])).toBe("GET");
    expect(selectionSummary(methods, ["GET", "POST"])).toBe("GET, POST");
    expect(selectionSummary(methods, ["GET", "POST", "PUT"])).toBe("GET +2");
  });

  it("count the view and each value chosen", () => {
    const filter = {
      view: "slow" as const,
      search: "x",
      selected: { ...NO_SELECTION, method: ["GET", "PUT"] },
    };

    expect(activeFilterCount(filter)).toBe(3);
    expect(activeFilterCount(OPEN_FILTER)).toBe(0);
  });
});

describe("the search", () => {
  it("finds a request by its name, URL, code, method, state or transport", () => {
    const find = (search: string) => shown({ ...OPEN_FILTER, search });

    expect(find("api.users.create")).toEqual(["failed"]);
    expect(find("users.create")).toEqual(["failed"]);
    expect(find("PAGE=2")).toHaveLength(6);
    expect(find("503")).toEqual(["failed"]);
    expect(find("post")).toEqual(["failed"]);
    expect(find("validation")).toEqual(["broken"]);
    expect(find("sse")).toEqual(["stream"]);
  });
});

describe("the Timeline's address", () => {
  it("carries the view, the search and each filter's values, and reads back the same", () => {
    const filter = {
      view: "errors" as const,
      search: "orders",
      selected: { ...NO_SELECTION, method: ["GET", "POST"], group: ["", "users"] },
    };

    const search = searchFromFilter(filter);

    expect(search).toEqual({ view: "errors", q: "orders", method: "GET,POST", group: "-,users" });
    expect(filterFromSearch(validateTimelineSearch({ ...search }))).toEqual(filter);
  });

  it("drops what it does not understand", () => {
    expect(validateTimelineSearch({ view: "everything", q: 4, status: "", mode: "proxy" })).toEqual(
      {
        mode: "proxy",
      },
    );
  });
});
