import { describe, expect, it } from "vitest";

import { sessionCookies, sessionCredentials } from "../../src/session/session-credentials";

const jar = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("sessionCredentials", () => {
  it("sends the session's cookies and leaves the application's own behind", () => {
    const credentials = sessionCredentials(
      jar({ sid: "a1", theme: "dark", logto_app: "x", _ga: "GA1" }),
      { cookies: ["sid", "logto_*"] },
    );

    expect(credentials.cookie).toBe("sid=a1; logto_app=x");
    expect(credentials.identifies).toBe(true);
  });

  it("sends the double-submit cookie with the session, and its token decoded", () => {
    const credentials = sessionCredentials(jar({ sid: "a1", "XSRF-TOKEN": "eyJpdiI6%3D" }), {
      cookies: ["sid"],
      csrf: { cookie: "XSRF-TOKEN", header: "x-xsrf-token" },
    });

    expect(credentials.cookie).toBe("sid=a1; XSRF-TOKEN=eyJpdiI6%3D");
    expect(credentials.csrf).toBe("eyJpdiI6=");
  });

  it("takes a bearer token from its cookie, which is not sent itself unless listed", () => {
    const credentials = sessionCredentials(jar({ "logto-access-token": "eyJhbGciOi.e30.sig" }), {
      bearer: "logto-access-token",
    });

    expect(credentials.bearer).toBe("eyJhbGciOi.e30.sig");
    expect(credentials.cookie).toBeUndefined();
    expect(credentials.identifies).toBe(true);
  });

  it("decodes a bearer token a framework's cookie API encoded", () => {
    const credentials = sessionCredentials(jar({ at: "abc%2Bdef%2F%3D" }), { bearer: "at" });

    expect(credentials.bearer).toBe("abc+def/=");
  });

  it("never decodes a token into a line break that would split its header", () => {
    const credentials = sessionCredentials(jar({ at: "a%0D%0AX-Evil%3A%201", csrf: "a%0Ab" }), {
      bearer: "at",
      csrf: { cookie: "csrf", header: "x-csrf" },
    });

    expect(credentials.bearer).toBeUndefined();
    expect(credentials.csrf).toBe("a%0Ab");
  });

  it("keeps a token with a literal % as it came", () => {
    const credentials = sessionCredentials(jar({ csrf: "100%sure" }), {
      cookies: ["sid"],
      csrf: { cookie: "csrf", header: "x-csrf" },
    });

    expect(credentials.csrf).toBe("100%sure");
  });

  it("says nothing identifies the user when only the double-submit cookie is there", () => {
    const credentials = sessionCredentials(jar({ csrftoken: "t" }), {
      cookies: ["sessionid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken" },
    });

    expect(credentials.identifies).toBe(false);
    expect(credentials.cookie).toBe("csrftoken=t");
  });

  it("treats a cookie with no value as no session", () => {
    const credentials = sessionCredentials(jar({ sid: "", at: "" }), {
      cookies: ["sid"],
      bearer: "at",
    });

    expect(credentials).toEqual({
      cookie: undefined,
      bearer: undefined,
      csrf: undefined,
      identifies: false,
    });
  });
});

describe("sessionCookies", () => {
  it("keeps the API's session, double-submit and bearer cookies from its answers", () => {
    const { kept, sent } = sessionCookies({
      cookies: ["sid"],
      bearer: "at",
      csrf: { cookie: "csrftoken", header: "x-csrftoken" },
    });

    expect(["sid", "at", "csrftoken", "other"].map(kept)).toEqual([true, true, true, false]);
    expect(sent("at")).toBe(false);
  });

  it("compiles each session once", () => {
    const session = { cookies: ["sid"] };

    expect(sessionCookies(session)).toBe(sessionCookies(session));
  });
});
