/**
 * A session or a forward that could not work as written is refused where
 * the API is defined, with the reason, rather than misbehaving on a call.
 */
import { describe, expect, it } from "vitest";

import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineGroup } from "../../src/define/group";
import { ConfigurationError } from "../../src/errors/configuration-error";

const { endpoint } = courier();
const BASE = "https://api.example.com";

function defineWith(options: Record<string, unknown>) {
  return () => defineApi({ name: "accounts", baseURL: BASE, endpoints: {}, ...options } as never);
}

function failureOf(define: () => unknown): ConfigurationError {
  try {
    define();
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error("defined without complaint");
}

describe("a session", () => {
  it("is accepted with names, prefixes, a bearer cookie and a double-submit token", () => {
    const define = defineWith({
      session: {
        cookies: ["sessionid", "logto_*"],
        bearer: "access_token",
        csrf: { cookie: "csrftoken", header: "X-CSRFToken" },
        relay: true,
        allowedOrigins: ["https://www.example.com"],
      },
    });

    expect(define).not.toThrow();
  });

  it("names a credential", () => {
    const failure = failureOf(defineWith({ session: { csrf: { cookie: "c", header: "x-c" } } }));

    expect(failure.code).toBe("SESSION_OPTIONS_INVALID");
    expect(failure.message).toBe(
      "accounts: session names no credential: list the cookies it is kept in, or a bearer cookie",
    );
  });

  it("has no option it does not know, such as a misspelt one", () => {
    expect(failureOf(defineWith({ session: { cookie: ["sid"] } })).message).toBe(
      'accounts: session has no option "cookie"',
    );
  });

  it("names cookies a browser keeps", () => {
    const failure = failureOf(defineWith({ session: { cookies: ["sid", "a b"] } }));

    expect(failure.message).toContain('session cookies: "a b" is not a cookie name');
  });

  it("names its bearer and double-submit cookies exactly, not by prefix", () => {
    expect(failureOf(defineWith({ session: { bearer: "token_*" } })).message).toContain(
      "session bearer:",
    );
    expect(
      failureOf(
        defineWith({ session: { cookies: ["sid"], csrf: { cookie: "c*", header: "x-c" } } }),
      ).message,
    ).toContain("session csrf.cookie:");
  });

  it("does not send its token in a header the session owns or no request carries", () => {
    const failure = failureOf(
      defineWith({ session: { cookies: ["sid"], csrf: { cookie: "c", header: "Cookie" } } }),
    );

    expect(failure.message).toContain('csrf.header: "Cookie" is sent by the session alone');
  });

  it("names where its double-submit token comes from by a path, under the API's address or from its root", () => {
    for (const from of ["csrf/", "/sanctum/csrf-cookie"]) {
      const csrf = { cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN", from };
      expect(defineWith({ session: { cookies: ["sid"], csrf } })).not.toThrow();
    }
  });

  it("refuses a place for its token that is no bare path of the API's", () => {
    const messages = [
      "https://other.example.com/csrf",
      "//other.example.com/csrf",
      "csrf?refresh=1",
      "csrf#token",
      "csrf/:id",
      "csrf token",
      "",
      42,
    ].map((from) => {
      const csrf = { cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN", from };
      return failureOf(defineWith({ session: { cookies: ["sid"], csrf } })).message;
    });

    expect(messages.every((message) => message.startsWith("accounts: session csrf.from: "))).toBe(
      true,
    );
    expect(messages[0]).toContain("names an address of its own");
    expect(messages[2]).toContain("is a bare path");
  });

  it("lists origins as a browser sends them", () => {
    const failure = failureOf(
      defineWith({ session: { cookies: ["sid"], allowedOrigins: ["https://www.example.com/"] } }),
    );

    expect(failure.code).toBe("INVALID_ALLOWED_ORIGIN");
  });

  it("is not sent over plain HTTP across the internet unless allowed", () => {
    const insecure = { baseURL: "http://api.example.com", session: { cookies: ["sid"] } };

    expect(failureOf(defineWith(insecure)).code).toBe("SESSION_INSECURE_TRANSPORT");
    expect(
      defineWith({ ...insecure, session: { cookies: ["sid"], allowHttp: true } }),
    ).not.toThrow();
    expect(defineWith({ baseURL: "http://api:8080", session: { cookies: ["sid"] } })).not.toThrow();
  });

  it("is not beside a header list that carries cookies wholesale", () => {
    const failure = failureOf(
      defineWith({ session: { cookies: ["sid"] }, allowedHeaders: ["Cookie"] }),
    );

    expect(failure.code).toBe("SESSION_HEADER_CONFLICT");
  });

  it("is not beside an endpoint, in a group at any depth, that carries cookies wholesale", () => {
    const inner = defineGroup({
      endpoints: { login: endpoint.post("login").headers(["set-cookie"]) },
    });
    const outer = defineGroup({ groups: { inner } });

    const failure = failureOf(defineWith({ session: { cookies: ["sid"] }, groups: { outer } }));

    expect(failure.message).toMatch(/^accounts\.outer\.inner\.login: "set-cookie"/);
  });

  it("leaves cookie headers alone on an API that keeps no session", () => {
    expect(defineWith({ allowedHeaders: ["cookie", "set-cookie"] })).not.toThrow();
  });
});

describe("forward", () => {
  it("is accepted with every option", () => {
    const define = defineWith({
      forward: {
        requestId: "x-correlation-id",
        trace: true,
        clientAddress: true,
        userAgent: true,
        locale: true,
        headers: ["x-tenant", "cf-ipcountry"],
      },
    });

    expect(define).not.toThrow();
  });

  it("refuses an option it does not have and a flag that is not one", () => {
    expect(failureOf(defineWith({ forward: { requestID: true } })).message).toBe(
      'accounts: forward has no option "requestID"',
    );
    expect(failureOf(defineWith({ forward: { trace: "yes" } })).message).toBe(
      "accounts: forward trace is true or false",
    );
  });

  it("carries no credential and no claim of an address", () => {
    expect(failureOf(defineWith({ forward: { headers: ["authorization"] } })).code).toBe(
      "FORWARD_OPTIONS_INVALID",
    );
    expect(failureOf(defineWith({ forward: { headers: ["X-Forwarded-For"] } })).message).toContain(
      "is never carried",
    );
  });

  it("sends a header with an option of its own to that option", () => {
    expect(failureOf(defineWith({ forward: { headers: ["user-agent"] } })).message).toContain(
      '"user-agent" has an option of its own, userAgent',
    );
  });
});

describe("an endpoint", () => {
  it("takes its source's session, none, or an unguarded one", () => {
    expect(() => endpoint.post("logout", { session: "unguarded" })).not.toThrow();
    expect(() => endpoint.get("catalog", { session: false, forward: false })).not.toThrow();
  });

  it("refuses any other value", () => {
    expect(() => endpoint.post("logout", { session: true } as never)).toThrow(
      'an endpoint\'s session is false or "unguarded", not true',
    );
    expect(() => endpoint.get("catalog", { forward: true } as never)).toThrow(
      "an endpoint's forward is false, not true",
    );
  });
});
