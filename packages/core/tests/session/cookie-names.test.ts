import { describe, expect, it } from "vitest";

import { cookieMatcher, cookieNameProblem } from "../../src/session/cookie-names";

describe("cookieMatcher", () => {
  it("matches a listed name exactly, its case included", () => {
    const isSession = cookieMatcher(["sid"]);

    expect(isSession("sid")).toBe(true);
    expect(isSession("SID")).toBe(false);
    expect(isSession("sid2")).toBe(false);
  });

  it("matches every name a trailing * prefix begins", () => {
    const isSession = cookieMatcher(["logto_*", "logto-id"]);

    expect(isSession("logto_app1")).toBe(true);
    expect(isSession("logto_")).toBe(true);
    expect(isSession("logto-id")).toBe(true);
    expect(isSession("logto-access-token")).toBe(false);
    expect(isSession("xlogto_app1")).toBe(false);
  });

  it("matches nothing when nothing is listed", () => {
    expect(cookieMatcher([])("sid")).toBe(false);
  });
});

describe("cookieNameProblem", () => {
  it("accepts names and, where allowed, prefixes", () => {
    expect(cookieNameProblem("sessionid", false)).toBeUndefined();
    expect(cookieNameProblem("__Host-sid", false)).toBeUndefined();
    expect(cookieNameProblem("logto_*", true)).toBeUndefined();
  });

  it("refuses a prefix where only a name may stand", () => {
    expect(cookieNameProblem("logto_*", false)).toContain("is not a cookie name");
  });

  it("refuses a bare * and a * inside a name", () => {
    expect(cookieNameProblem("*", true)).toBe("a prefix needs at least one character before the *");
    expect(cookieNameProblem("a*b", true)).toContain("is not a cookie name");
  });

  it("refuses separators, spaces and empty or non-string values", () => {
    expect(cookieNameProblem("a=b", true)).toContain("is not a cookie name");
    expect(cookieNameProblem("a b", true)).toContain("is not a cookie name");
    expect(cookieNameProblem("a;b", true)).toContain("is not a cookie name");
    expect(cookieNameProblem("", true)).toBe("a cookie name is a non-empty string");
    expect(cookieNameProblem(7, true)).toBe("a cookie name is a non-empty string");
  });
});
