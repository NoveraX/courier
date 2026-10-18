/**
 * The saved sessions Studio lists, read from its answer: a count of each
 * one's calls taken where it has one — a session saved before calls were
 * counted apart from requests has none — and an answer that is not a list
 * of them refused.
 */
import { describe, expect, it } from "vitest";

import { sessionSummariesOf } from "@/features/settings/session-summary";

const STATS = {
  totalRequests: 2,
  successCount: 1,
  errorCount: 1,
  avgDuration: 250,
  totalSize: 1000,
};

function summary(stats: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "s1",
    name: "Checkout fails",
    savedAt: 2,
    startedAt: 1,
    duration: 1,
    appCount: 1,
    stats,
  };
}

describe("the saved sessions listed", () => {
  it("keep each one's count of calls, and read one saved before calls were counted", () => {
    const [counted, older] = sessionSummariesOf([
      summary({ ...STATS, totalCalls: 3 }),
      summary(STATS),
    ]);

    expect(counted?.stats.totalCalls).toBe(3);
    expect(older?.stats.totalCalls).toBeUndefined();
  });

  it("are refused where a count of calls is not a number", () => {
    expect(() => sessionSummariesOf([summary({ ...STATS, totalCalls: "3" })])).toThrow(
      "Studio's list of saved sessions could not be read",
    );
  });
});
