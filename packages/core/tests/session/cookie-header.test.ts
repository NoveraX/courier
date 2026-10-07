import { describe, expect, it } from "vitest";

import { cookieHeaderOf, cookieJarOf, parseCookieHeader } from "../../src/session/cookie-header";

describe("parseCookieHeader", () => {
  it("reads every pair in order, values as they were sent", () => {
    const pairs = parseCookieHeader("sid=a1; theme=dark; token=eyJ%3D");

    expect(pairs).toEqual([
      { name: "sid", value: "a1" },
      { name: "theme", value: "dark" },
      { name: "token", value: "eyJ%3D" },
    ]);
  });

  it("passes over a pair with no name or no =", () => {
    expect(parseCookieHeader("=x; flag; a=1")).toEqual([{ name: "a", value: "1" }]);
  });

  it("keeps an = inside a value", () => {
    expect(parseCookieHeader("b64=YWJj==")).toEqual([{ name: "b64", value: "YWJj==" }]);
  });

  it("reads nothing from an absent header", () => {
    expect(parseCookieHeader(null)).toEqual([]);
    expect(parseCookieHeader(undefined)).toEqual([]);
    expect(parseCookieHeader("")).toEqual([]);
  });
});

describe("cookieJarOf", () => {
  it("keeps the first cookie of a name, the one a browser lists first", () => {
    const jar = cookieJarOf("sid=page; sid=site");

    expect(jar.get("sid")).toBe("page");
    expect(jar.size).toBe(1);
  });
});

describe("cookieHeaderOf", () => {
  it("joins pairs as a browser sends them", () => {
    const header = cookieHeaderOf([
      { name: "sid", value: "a1" },
      { name: "csrftoken", value: "t" },
    ]);

    expect(header).toBe("sid=a1; csrftoken=t");
  });
});
