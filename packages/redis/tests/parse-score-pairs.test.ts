import { describe, expect, it } from "vitest";

import { parseScorePairs } from "../src/redis-presence-keys";

describe("parseScorePairs", () => {
  it("reads the flat RESP2 reply", () => {
    const { connectionIds, scores } = parseScorePairs(["c1", "100", "c2", "200"]);

    expect(connectionIds).toEqual(["c1", "c2"]);
    expect(scores.get("c1")).toBe(100);
    expect(scores.get("c2")).toBe(200);
  });

  it("reads the paired RESP3 reply", () => {
    const { connectionIds, scores } = parseScorePairs([
      ["c1", 100],
      ["c2", 200],
    ]);

    expect(connectionIds).toEqual(["c1", "c2"]);
    expect(scores.get("c1")).toBe(100);
    expect(scores.get("c2")).toBe(200);
  });

  it("reads a RESP3 reply whose scores arrive as strings", () => {
    const { scores } = parseScorePairs([["c1", "1700000000000"]]);

    expect(scores.get("c1")).toBe(1_700_000_000_000);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseScorePairs([])).toEqual({ connectionIds: [], scores: new Map() });
  });

  it("keeps a zero score, which is a valid timestamp boundary", () => {
    const { connectionIds, scores } = parseScorePairs(["c1", "0"]);

    expect(connectionIds).toEqual(["c1"]);
    expect(scores.get("c1")).toBe(0);
  });

  it("drops a flat reply's trailing member that has no score", () => {
    const { connectionIds } = parseScorePairs(["c1", "100", "c2"]);

    expect(connectionIds).toEqual(["c1"]);
  });
});
