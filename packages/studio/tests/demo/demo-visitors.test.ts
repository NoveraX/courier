/**
 * What a public demo lets a page without the token send: reads within its
 * counts, the Playground and the mocks within its bounds, its own
 * Playground history; never a change to what every visitor sees, and
 * never an event the demo does not name — as Studio's own rule refuses an
 * event it does not list.
 */
import { describe, expect, it } from "vitest";

import { DEMO_SHARED_REFUSAL, DEMO_TOKEN_REFUSAL } from "../../src/server/demo/demo-refusals";
import { demoVisitors } from "../../src/server/demo/demo-visitors";
import { READING_EVENTS } from "../../src/server/ui-token-guard";

const VISITOR = { page: "page-1", address: "203.0.113.5" };

describe("a demo visitor's events", () => {
  it.each(["requests:clear", "mock:logs:clear", "view:live", "requests:pin", "page:state:set"])(
    "refuses %s, which changes what every visitor sees, and says so",
    (event) => {
      const visitors = demoVisitors({ callsInFlight: () => 0 });

      expect(visitors.decide(VISITOR, event, [{}])).toEqual({
        kind: "refuse",
        reason: DEMO_SHARED_REFUSAL,
      });
    },
  );

  it("refuses an event the demo does not name, with what the demo does not do", () => {
    const visitors = demoVisitors({ callsInFlight: () => 0 });

    expect(visitors.decide(VISITOR, "an:event:added:later", [{}])).toEqual({
      kind: "refuse",
      reason: DEMO_TOKEN_REFUSAL,
    });
  });

  it("runs each event that reads what Studio shows, counted", () => {
    const visitors = demoVisitors({ callsInFlight: () => 0 });

    for (const event of READING_EVENTS) {
      expect(visitors.decide(VISITOR, event, [{ serverId: "shop" }])).toEqual({ kind: "run" });
    }
  });

  it("keeps a visitor's Playground history to its page, and lets it stop its own calls", () => {
    const visitors = demoVisitors({ callsInFlight: () => 0 });

    expect(visitors.decide(VISITOR, "playground:history:save", [[]])).toEqual({ kind: "drop" });
    expect(visitors.decide(VISITOR, "playground:exec:cancel", [{ rid: "r1" }])).toEqual({
      kind: "run",
    });
  });
});
