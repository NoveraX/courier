/**
 * A WebSocket request's path matched against the template of the channel
 * it opens: text matches itself, a doubled colon one colon in it, a
 * parameter takes its segment or its part of one, and a `{+name}` the
 * segments its value spans, decoded.
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

  it("captures a {+name} across the segments its value spans, alone or beside text", () => {
    expect(matchPath("rooms/{+name}", "rooms/a/b%20c")).toEqual({ name: "a/b c" });
    expect(matchPath("{+name}::watch", "projects/p/rooms/r:watch")).toEqual({
      name: "projects/p/rooms/r",
    });
    expect(matchPath("rooms/{+name}/events", "rooms/a/b/events")).toEqual({ name: "a/b" });
    expect(matchPath("rooms/{+name}", "rooms")).toBeUndefined();
  });

  it("captures a parameter in braces that text follows at once", () => {
    expect(matchPath("files/{id}abc", "files/x7abc")).toEqual({ id: "x7" });
    expect(matchPath("files/{id}abc", "files/x7/abc")).toBeUndefined();
  });

  it("matches no segment the template's text does not fit, nor a malformed escape", () => {
    expect(matchPath(":room::watch", "lobby:leave")).toBeUndefined();
    expect(matchPath(":room", "%E0%A4%A")).toBeUndefined();
    expect(matchPath(":room/events", "lobby")).toBeUndefined();
  });
});
