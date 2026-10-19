/**
 * A WebSocket request's path matched against the template of the channel
 * it opens: text matches itself, a doubled colon one colon in it, and a
 * parameter takes its segment or its part of one, decoded.
 */
import { describe, expect, it } from "vitest";

import { matchPath } from "../../src/server/match-path";

describe("matchPath", () => {
  it("matches text, a doubled colon one colon in it", () => {
    expect(matchPath("v1/rooms::watch", "v1/rooms:watch")).toEqual({});
    expect(matchPath("v1/rooms::watch", "v1/rooms::watch")).toBeUndefined();
  });

  it("captures a parameter alone or beside text, decoded", () => {
    expect(matchPath(":room/events", "lobby%20one/events")).toEqual({ room: "lobby one" });
    expect(matchPath(":room::watch", "a%3Ab:watch")).toEqual({ room: "a:b" });
  });

  it("matches no segment the template's text does not fit, nor a malformed escape", () => {
    expect(matchPath(":room::watch", "lobby:leave")).toBeUndefined();
    expect(matchPath(":room", "%E0%A4%A")).toBeUndefined();
    expect(matchPath(":room/events", "lobby")).toBeUndefined();
  });
});
