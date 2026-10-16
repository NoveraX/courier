/**
 * A saved session keeps which calls `browsersOnly` let through on Studio's
 * one-time pass, and marks no other.
 */
import { describe, expect, it } from "vitest";

import { buildSession } from "../src/server/session-builder";

describe("a saved request let through on Studio's pass", () => {
  it("keeps the mark, and gives it to nothing in another shape", () => {
    const session = buildSession({
      requests: [
        { id: "r1", source: "shop", method: "list", startedAt: 1, studioPass: true },
        { id: "r2", source: "shop", method: "list", startedAt: 2, studioPass: "true" },
        { id: "r3", source: "shop", method: "list", startedAt: 3 },
      ],
      apps: [],
    });

    expect(session.requests.map((request) => request.studioPass)).toEqual([
      true,
      undefined,
      undefined,
    ]);
  });
});
