/**
 * The audit's duplicate-request rule: calls to one endpoint with the same
 * variables close together, counted burst by burst — its message says how
 * many calls in how many bursts, not that they all came within one window.
 */
import { describe, expect, it } from "vitest";

import { detectDuplicates } from "@/features/audit/rules-patterns";
import { requestEntry } from "./request-entry-fixture";

describe("the duplicate-request rule", () => {
  it("says how many calls came in how many bursts", () => {
    const at = [1_000, 1_400, 1_900, 30_000, 30_500];
    const calls = at.map((startedAt, i) =>
      requestEntry({ id: `d${i}`, startedAt, variables: { page: 1 } }),
    );

    const [item] = detectDuplicates(calls);

    expect(item?.description).toBe(
      '"api.users.list" was called again with the same variables within 2 s — 5 calls in 2 bursts.',
    );
  });

  it("tells calls apart by nested variables, and not by the order of their keys", () => {
    const filter = (status: string) => ({ filter: { status, page: 1 } });
    const differing = [
      requestEntry({ id: "a", startedAt: 1_000, variables: filter("open") }),
      requestEntry({ id: "b", startedAt: 1_200, variables: filter("closed") }),
    ];
    const reordered = [
      requestEntry({ id: "c", startedAt: 1_000, variables: { a: 1, b: { x: 1, y: 2 } } }),
      requestEntry({ id: "d", startedAt: 1_200, variables: { b: { y: 2, x: 1 }, a: 1 } }),
    ];

    expect(detectDuplicates(differing)).toEqual([]);
    expect(detectDuplicates(reordered).map((item) => item.requestIds)).toEqual([["c", "d"]]);
  });
});
