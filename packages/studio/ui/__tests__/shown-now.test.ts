/**
 * The "now" the shown requests are read against: the clock for the live
 * requests, and the end of the last call for a saved session.
 */
import { describe, expect, it } from "vitest";

import { shownNow } from "@/features/sessions/shown-now";
import { requestEntry } from "./request-entry-fixture";

const NOW = 10_000_000;

function timed(id: string, agoMs: number, total?: number) {
  return requestEntry({
    id,
    startedAt: NOW - agoMs,
    timing: total === undefined ? undefined : { total, middleware: 0, fetch: total, validation: 0 },
  });
}

describe("the now shown requests are read against", () => {
  it("is the clock for the live requests, and the end of the last call for a saved session", () => {
    const calls = [timed("a", 600_000, 200), timed("b", 300_000, 1_500), timed("c", 400_000)];

    expect(shownNow(calls, NOW, false)).toBe(NOW);
    expect(shownNow(calls, NOW, true)).toBe(NOW - 300_000 + 1_500);
    expect(shownNow([], NOW, true)).toBe(NOW);
  });
});
