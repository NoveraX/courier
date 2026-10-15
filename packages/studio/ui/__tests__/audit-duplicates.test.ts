/**
 * The audit's duplicate-request rule: calls to one endpoint with the same
 * variables close together, counted burst by burst — its message says how
 * many calls in how many bursts, not that they all came within one window
 * — and a read another call's request answered, which sent no request of
 * its own, is no duplicate.
 */
import { describe, expect, it } from "vitest";

import { detectDuplicates } from "@/features/audit/rules-duplicates";
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

  it("counts no call whose read another call's request answered: it sent no request", () => {
    const first = requestEntry({ id: "s0", startedAt: 1_000, variables: { page: 1 } });
    const joined = requestEntry({
      id: "s1",
      startedAt: 1_300,
      variables: { page: 1 },
      shared: { by: "flight", with: "s0" },
    });
    const replayed = requestEntry({
      id: "s2",
      startedAt: 1_800,
      variables: { page: 1 },
      shared: { by: "render", with: "s0" },
    });

    expect(detectDuplicates([first, joined, replayed])).toEqual([]);
    expect(
      detectDuplicates([
        first,
        joined,
        requestEntry({ id: "s3", startedAt: 1_900, variables: { page: 1 } }),
      ]).map((item) => item.requestIds),
    ).toEqual([["s0", "s3"]]);
  });
});
