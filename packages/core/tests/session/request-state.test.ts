import { describe, expect, it, vi } from "vitest";
import { cookieJarFor, keepCookie, requestIdFor } from "../../src/server/session/request-state";
import type { IncomingRequest } from "../../src/session/incoming-request";

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

describe("the state of a request being served", () => {
  it("is shared with another copy of Courier, as a page's own bundle may carry one", async () => {
    vi.resetModules();
    const other = await import("../../src/server/session/request-state");
    const request = incoming("sid=old");

    keepCookie(request, { name: "sid", value: "new" });
    const id = requestIdFor(request, () => "first");

    expect(other.cookieJarFor).not.toBe(cookieJarFor);
    expect(other.cookieJarFor(request).get("sid")).toBe("new");
    expect(other.requestIdFor(request, () => "second")).toBe(id);
  });
});
