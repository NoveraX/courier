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
});
