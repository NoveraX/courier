/**
 * A saved session keeps which agent tool each call ran for, and drops what
 * is not one: Studio reads the session back as the page saved it.
 */
import { describe, expect, it } from "vitest";

import { buildSession } from "../src/server/session-builder";

describe("a saved request an agent made", () => {
  it("keeps the tool and the client, and nothing in another shape", () => {
    const session = buildSession({
      requests: [
        {
          id: "r1",
          source: "shop",
          method: "cancel",
          startedAt: 1,
          agent: { tool: "orders_cancel", access: "destructive", client: "code-editor 2.1.0" },
        },
        {
          id: "r2",
          source: "shop",
          method: "cancel",
          startedAt: 2,
          agent: { tool: "orders_cancel", access: "root" },
        },
        { id: "r3", source: "shop", method: "get", startedAt: 3 },
      ],
      apps: [],
    });

    expect(session.requests.map((request) => request.agent)).toEqual([
      { tool: "orders_cancel", access: "destructive", client: "code-editor 2.1.0" },
      undefined,
      undefined,
    ]);
  });
});
