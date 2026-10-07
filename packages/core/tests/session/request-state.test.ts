import { describe, expect, it } from "vitest";

import type { IncomingRequest } from "../../src/session/incoming-request";
import { cookieJarFor, keepCookie } from "../../src/session/request-state";

function incoming(cookie: string): IncomingRequest {
  return { key: {}, method: "GET", headers: new Headers({ cookie }) };
}

describe("cookieJarFor", () => {
  it("starts from the request's Cookie header", () => {
    const jar = cookieJarFor(incoming("sid=a1; theme=dark"));

    expect([...jar]).toEqual([
      ["sid", "a1"],
      ["theme", "dark"],
    ]);
  });

  it("sends the session the API renewed with the calls still to come", () => {
    const request = incoming("sid=old; theme=dark");

    keepCookie(request, { name: "sid", value: "new", maxAge: 3600 });

    expect(cookieJarFor(request).get("sid")).toBe("new");
  });

  it("forgets a cookie the API deleted", () => {
    const request = incoming("sid=a1");

    keepCookie(request, { name: "sid", value: "", maxAge: 0 });

    expect(cookieJarFor(request).has("sid")).toBe(false);
  });

  it("keeps each request's cookies to itself", () => {
    const alice = incoming("sid=alice");
    const bob = incoming("sid=bob");

    keepCookie(alice, { name: "sid", value: "alice-2" });

    expect(cookieJarFor(bob).get("sid")).toBe("bob");
  });
});
