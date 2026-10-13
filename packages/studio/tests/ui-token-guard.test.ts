/**
 * Studio's own rule for a page without the token: it runs the events that
 * read what Studio shows, and refuses every other — a writing event, and
 * one added later that the list does not name, alike.
 */
import { describe, expect, it } from "vitest";

import { TOKEN_REFUSAL } from "../src/server/token-guard";
import { READ_ONLY_VISITORS, READING_EVENTS } from "../src/server/ui-token-guard";

const VISITOR = { page: "page-1", address: "127.0.0.1" };

describe("Studio's own rule for a page without the token", () => {
  it("runs the events that read what Studio shows", () => {
    expect([...READING_EVENTS].sort()).toEqual(["mock:body", "mock:store:get", "request:body"]);
    for (const event of READING_EVENTS) {
      expect(READ_ONLY_VISITORS.decide(VISITOR, event, [])).toEqual({ kind: "run" });
    }
  });

  it.each([
    "requests:clear",
    "requests:pin",
    "mock:command",
    "mock:managed",
    "playground:exec",
    "page:state:set",
    "an:event:added:later",
  ])("refuses %s, with the reason the token is asked for", (event) => {
    expect(READ_ONLY_VISITORS.decide(VISITOR, event, [])).toEqual({
      kind: "refuse",
      reason: TOKEN_REFUSAL,
    });
  });
});
