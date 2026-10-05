/**
 * The audit's N+1 rule, given requests as the store holds them: newest
 * first. It walks them oldest first, so a list call comes before its detail
 * calls and the rule fires on real traffic, stopping where its time window
 * closes.
 */
import { describe, expect, it } from "vitest";
import { detectNPlusOne } from "@/features/audit/rules-patterns";
import type { RequestEntry } from "@/store/types";

function request(id: string, method: string, startedAt: number, data?: unknown): RequestEntry {
  return {
    id,
    source: "api",
    group: "users",
    method,
    variables: undefined,
    mode: "direct",
    status: "success",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt,
    sessionId: "app",
    timing: { total: 20, middleware: 0, fetch: 20, validation: 0 },
    data,
  };
}

describe("the N+1 rule", () => {
  it("finds a list call followed by one detail call per item, as the store orders them", () => {
    const oldestFirst = [
      request("list", "list", 1_000, [{ id: 1 }, { id: 2 }, { id: 3 }]),
      request("d1", "byId", 1_030),
      request("d2", "byId", 1_060),
      request("d3", "byId", 1_090),
    ];

    const items = detectNPlusOne([...oldestFirst].reverse());

    expect(items.map((item) => [item.title, item.requestIds])).toEqual([
      ["N+1 request pattern", ["list", "d1", "d2", "d3"]],
    ]);
  });

  it("does not count calls made after the window closed", () => {
    const items = detectNPlusOne(
      [
        request("list", "list", 1_000, [{ id: 1 }, { id: 2 }]),
        request("d1", "byId", 9_000),
        request("d2", "byId", 9_030),
      ].reverse(),
    );

    expect(items).toEqual([]);
  });
});
