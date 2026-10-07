import { describe, expect, it } from "vitest";

import { isDeletion, parseSetCookie, serializeSetCookie } from "../../src/session/set-cookie";

describe("parseSetCookie", () => {
  it("reads the cookie and the attributes a browser acts on", () => {
    const cookie = parseSetCookie(
      "sid=a1; Domain=.Example.com; Path=/api; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; Secure; HttpOnly; SameSite=lax; Partitioned; Priority=high",
    );

    expect(cookie).toEqual({
      name: "sid",
      value: "a1",
      domain: "example.com",
      path: "/api",
      expires: "Wed, 21 Oct 2026 07:28:00 GMT",
      maxAge: 3600,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      partitioned: true,
      priority: "High",
    });
  });

  it("keeps a value undecoded, as the API wrote it", () => {
    expect(parseSetCookie("XSRF-TOKEN=eyJpdiI6%3D; Path=/")?.value).toBe("eyJpdiI6%3D");
  });

  it("leaves out attributes it does not know and malformed ones", () => {
    const cookie = parseSetCookie(
      "sid=a1; Max-Age=soon; SameSite=sometimes; Path=relative; Foo=bar",
    );

    expect(cookie).toEqual({ name: "sid", value: "a1" });
  });

  it("sets nothing for a header without a name or with a broken one", () => {
    expect(parseSetCookie("=a1")).toBeUndefined();
    expect(parseSetCookie("novalue")).toBeUndefined();
    expect(parseSetCookie("bad name=a1")).toBeUndefined();
  });

  it("sets nothing when the value holds a control character", () => {
    expect(parseSetCookie("sid=a\u0001b")).toBeUndefined();
  });
});

describe("serializeSetCookie", () => {
  it("writes the cookie back with its attributes in a fixed order", () => {
    const header = serializeSetCookie({
      name: "sid",
      value: "a1",
      path: "/",
      maxAge: 0,
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
    });

    expect(header).toBe("sid=a1; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict");
  });

  it("round-trips what it parsed", () => {
    const header = "sid=a1; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=None";

    const cookie = parseSetCookie(header);

    expect(cookie && serializeSetCookie(cookie)).toBe(header);
  });
});

describe("isDeletion", () => {
  it("treats a Max-Age of zero or less as a deletion", () => {
    expect(isDeletion({ name: "sid", value: "", maxAge: 0 })).toBe(true);
    expect(isDeletion({ name: "sid", value: "", maxAge: -1 })).toBe(true);
    expect(isDeletion({ name: "sid", value: "a", maxAge: 60 })).toBe(false);
  });

  it("treats an expiry in the past as a deletion when no Max-Age says otherwise", () => {
    const now = Date.parse("2026-10-07T00:00:00Z");

    expect(
      isDeletion({ name: "sid", value: "", expires: "Thu, 01 Jan 1970 00:00:00 GMT" }, now),
    ).toBe(true);
    expect(
      isDeletion({ name: "sid", value: "a", expires: "Fri, 01 Jan 2100 00:00:00 GMT" }, now),
    ).toBe(false);
    expect(
      isDeletion(
        { name: "sid", value: "a", maxAge: 60, expires: "Thu, 01 Jan 1970 00:00:00 GMT" },
        now,
      ),
    ).toBe(false);
  });

  it("keeps a session cookie, one with neither", () => {
    expect(isDeletion({ name: "sid", value: "a" })).toBe(false);
  });
});
