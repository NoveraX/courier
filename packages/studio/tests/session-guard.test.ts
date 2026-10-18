/**
 * A saved session read back from Studio's store: its figures are checked
 * rather than trusted, a count of its calls taken where it has one — a
 * session saved before calls were counted apart from requests has none.
 */
import { describe, expect, it } from "vitest";

import { readSavedSession } from "../src/server/session-guard";

const STATS = {
  totalRequests: 2,
  successCount: 1,
  errorCount: 1,
  avgDuration: 250,
  totalSize: 1000,
};

function saved(stats: Record<string, unknown>): string {
  return JSON.stringify({
    id: "s1",
    name: "Checkout fails",
    savedAt: 2,
    startedAt: 1,
    duration: 1,
    apps: [],
    requests: [{ id: "r1" }],
    stats,
  });
}

describe("a saved session read back", () => {
  it("keeps its count of calls, or reads one saved before calls were counted, without it", () => {
    expect(readSavedSession(saved({ ...STATS, totalCalls: 3 }))?.stats.totalCalls).toBe(3);
    expect(readSavedSession(saved(STATS))?.stats).toEqual(STATS);
  });

  it("is refused where its count of calls is not a number", () => {
    expect(readSavedSession(saved({ ...STATS, totalCalls: "3" }))).toBeNull();
  });
});
